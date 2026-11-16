# Website form submissions intake

Website forms built in the Strapi form builder can deliver submissions to the
CRM through the same public API bridge, JetStream broker and CRM-side consumer
pattern as event registrations (`/v1/events/registrations`). The route is
additive; the events route, its size cap, schema and rate-limit budget are
unchanged.

```
browser ──POST /v1/forms/submissions──▶ seawatch-api (scripts/public-api.ts)
        ──JetStream seawatch.forms.submissions.v1──▶ CRM consumer
          (shared intake consumer scripts/consume-public-intake.ts, via wss://seawatch-api.k8s-vpn.sea.watch)
        ──▶ Contact / FormSubmission / ContactEngagement (one transaction)
```

## HTTP contract (v1)

`POST https://api.sea.watch/v1/forms/submissions`

- `Content-Type: application/json` (otherwise 415).
- `Idempotency-Key: <uuid>` — required (400 otherwise). It becomes the
  `submissionId`. Retries of the same logical submission reuse it; a changed
  submission uses a new key.
- Body at most 65536 bytes (413 otherwise), strict JSON (unknown keys → 400):

```json
{
  "version": 1,
  "teamId": "<CRM team UUID>",
  "form": { "id": "1..64", "title": "1..255", "revision": "1..64", "locale": "2..10" },
  "page": "/optional/path (max 2048)",
  "submittedAt": "ISO-8601 datetime",
  "contact": {
    "email": "required; trimmed + lowercased; max 255",
    "name": "optional 1..255",
    "phone": "optional max 80",
    "postalCode": "optional max 32",
    "city": "optional max 255",
    "country": "optional max 255"
  },
  "answers": [
    {
      "id": "^[a-zA-Z][a-zA-Z0-9_-]{0,79}$",
      "label": "1..500",
      "type": "text|textarea|email|number|date|single|multiple|consent",
      "value": "string ≤10000 | number | boolean | string[] (≤100 × ≤80)",
      "display": "optional string ≤500 | string[] (≤100 × ≤500)",
      "purpose": "optional, consent answers only: marketing"
    }
  ]
}
```

At most 100 answers. Empty optional contact strings are treated as omitted.
The schema lives in `src/lib/public-forms/submission.ts`.

Responses (JSON, `Cache-Control: no-store`):

| Status | Meaning |
|---|---|
| 202 `{"submissionId","status":"received"}` | Stored in JetStream; not yet persisted in the CRM |
| 400 | Invalid JSON, invalid fields, or missing/invalid `Idempotency-Key` |
| 403 | Origin not in `PUBLIC_EVENTS_ORIGINS` |
| 404 / 405 | Unknown path (exact match) / method other than POST or OPTIONS |
| 413 / 415 | Body over 65536 bytes / not JSON |
| 429 + `Retry-After: 3600` | Per-IP form budget exhausted (separate from events) |
| 503 | Broker unavailable; retry with the same `Idempotency-Key` |

CORS is identical to the events route and uses the same `PUBLIC_EVENTS_ORIGINS`
allowlist (see [`PUBLIC_EVENTS_BRIDGE_CORS.md`](PUBLIC_EVENTS_BRIDGE_CORS.md)):
exact origins, preflight allows `POST, OPTIONS` with
`Content-Type, Idempotency-Key`, and `Retry-After` is exposed. No origin change
is required for forms.

## JetStream

| Purpose | Stream | Subject |
|---|---|---|
| Submissions (workqueue, file, max_msg_size 98304, duplicate_window 24h, max_bytes 1 GiB, discard new) | `SEAWATCH_FORM_SUBMISSIONS` | `seawatch.forms.submissions.v1` |
| Failed / needs review (limits, 1 GiB) | `SEAWATCH_FORM_SUBMISSION_FAILURES` | `seawatch.forms.submissions.failed.v1` |
| Rate limit (10 msgs/subject, discard_new_per_subject, max_age 1h) | `SEAWATCH_FORM_RATE_LIMIT` | `seawatch.ratelimit.forms.<sha256(key:ip)>` |

Message: `{"version":1,"submissionId","receivedAt","submission":{…body…}}`,
published with `msgID = <submissionId>:<sha256(JSON.stringify(submission))>`
so identical retries within 24 h are deduplicated by the broker.

Durable consumer `crm-form-submissions-v1`: explicit ack, ack_wait 60 s,
max_ack_pending 1, unlimited redelivery. The consumer creates it on first start.

## CRM processing

One shared consumer process handles all public intakes:
`scripts/consume-public-intake.ts` (`yarn intake:consume`; the existing
`scripts/consume-event-registrations.ts` command now runs it too) uses one NATS
connection (user `crm`) and one durable consumer per pipeline
(`crm-event-registrations-v1`, `crm-form-submissions-v1`). The runner is
`src/lib/public-intake/consumer.ts`; pipelines are defined in
`src/lib/public-intake/pipelines.ts`.

Pipelines are isolated: if a pipeline cannot set up or keep its subscription
(stream not yet initialized, missing NATS permission, subscription ended), only
that pipeline logs `<name>: consumer unavailable, retrying.` with the phase and
error codes (never messages or payloads) and restarts with backoff (5 s … 5 min);
the other keeps processing. Per message, both pipelines have the same semantics:

- Ack only after the transaction commits; `working()` every 15 s while busy.
- Existing `submissionId` → ack without changes. A concurrent unique violation
  (P2002) is acked only when the row exists.
- Invalid envelopes, submissions for a team that does not exist or has
  `publicFormsEnabled = false`, and messages delivered 10 times are copied to
  `seawatch.forms.submissions.failed.v1` and then acked. If that publish fails
  the original stays queued.
- Other errors are nak'ed with exponential backoff (10 s … 15 min).

`src/services/form-submissions` persists, in one transaction:

- Contact matching shared with event registrations
  (`src/services/contact-intake`): identity email (primary/alias) within the
  team, then phone, else create (name falls back to the email address). Existing
  contacts only get empty `name`, primary email, `phone`, `postalCode`, `city`
  and `country` filled; nothing is overwritten. A contact without a primary
  email always gets the submitted one. Changes are written to the contact
  change log.
- Proposed changes: a non-empty submitted value that differs from a non-empty
  contact value is recorded as a `PROPOSED` change-log entry (`fieldName`,
  current value as `oldValue`, submitted value as `newValue`, `userName`
  "Website form" or "Event registration", source and `submissionId` in
  `metadata`); the contact is unchanged. Values are compared loosely first:
  names, city and country ignoring case and repeated spaces, postal codes
  ignoring spaces, phones by digits only, emails lowercased. When the contact
  was matched by phone, a different primary email is proposed too. An identical
  unresolved proposal (same contact, field and value) is not recorded again.
  Event registrations use the same matching and record proposals the same way.
  The engagement message notes "N contact changes pending review".
- `FormSubmission` row (form id/title/revision, locale, page, answers JSON,
  submittedAt, receivedAt).
- One `ContactConsent` (`GRANTED`, source `FORM`) per ticked consent answer
  with a `purpose`, holding the label as the wording, the locale, form,
  submission and `submittedAt`. Unticked or purpose-less consent answers
  record nothing beyond the answers; see `docs/DATA_RULES.md` ("Consent").
- One `ContactEngagement`: direction `INBOUND`, source `FORM`, subject
  `Form: <title>`, message of `label: display/value` lines,
  `externalId = submissionId`, `externalSource = "website-form"`,
  `engagedAt = receivedAt`. It appears in the contact history and activity inbox
  as "Website form".

Proposal lifecycle (append-only): a proposal is pending while no entry
references it. Applying it writes a normal `UPDATED` entry with
`proposalId = <proposal id>` and the value at apply time as `oldValue`;
declining writes a `PROPOSAL_REJECTED` entry with `proposalId`. A partial
unique index allows one resolution per proposal. The change history shows
proposals as pending, applied or rejected. The review UI and the apply/reject
actions are not part of this change.

Migration: `prisma/migrations/20261112120000_public_form_submissions`.

## Forms page and public counter

**Forms page** (CRM → Forms, `src/services/forms`): one row per form id the
team received, named by its newest title, with submissions, people (unique
contacts) and the last received date. A form's page lists its submissions
with one column per question, linking to each contact. Like every contact
list, it shows only submissions of contacts the user may see (group
visibility), trashed contacts included.

**Public counter.** The website can show how many people sent a form,
without the CRM taking requests from the internet:

```
CRM intake consumer ──every 30 s, if changed──▶ NATS stream SEAWATCH_FORM_COUNTS
  (same outgoing connection, user crm)           subject seawatch.forms.counts.v1.<teamId>.<formId>
                                                 (only the last message per subject kept)
browser ──GET /v1/forms/count?team=&form=──▶ bridge ──last message──┘
```

- A form's page has the switch "Show the number on the website" and an
  optional goal (`FormSetting`). Only forms the team received can be set.
- The number is the form's unique contacts, all of them: it is public,
  the people are not.
- The consumer publishes `{"public":true,"count":N,"goal":G|null}`, or
  `{"public":false}` when switched off, only when the value changed
  (`src/lib/public-forms/counts.ts`).
- The bridge answers `200 {"count","goal"}` with
  `Cache-Control: public, max-age=60`, `404` when the form has no public
  count, `400` for a bad team UUID or form id (letters, digits, `-`, `_`,
  at most 64), `503` when NATS is unreachable. It caches each answer for 60 s
  (at most 1000 forms). Same CORS allowlist; GET and OPTIONS only.
- If the CRM is down the bridge keeps serving the last count; new
  submissions wait in their stream and the count catches up.

## Enabling a team

Teams are opted out by default. After the migration is deployed:

```sql
UPDATE "Teams" SET "publicFormsEnabled" = true WHERE id = '<team uuid>';
```

Then configure the Strapi form's CRM destination with that `teamId`. Disable by
setting the flag back to `false`; later submissions land in the failed stream.

## Operator rollout

These are instructions only; implementation and local tests do not deploy.

1. **NATS authorization.** Regenerate `authorization.conf` from
   `deploy/seawatch-api/nats-authorization.conf.example` with the existing
   passwords and reseal it as Secret `seawatch-nats-auth`
   (`deploy/seawatch-api/kubernetes/nats-auth-sealed-secret.yaml`). New grants:
   `api` may publish `seawatch.forms.submissions.v1` and
   `seawatch.ratelimit.forms.*`; `crm` gets STREAM.INFO / CONSUMER.INFO /
   CONSUMER.CREATE / DURABLE.CREATE / MSG.NEXT for
   `SEAWATCH_FORM_SUBMISSIONS` + `crm-form-submissions-v1`, and may publish
   `seawatch.forms.submissions.failed.v1`. For the public counter, `crm` may
   publish `seawatch.forms.counts.v1.>` and `api` may publish
   `$JS.API.STREAM.MSG.GET.SEAWATCH_FORM_COUNTS` (reading the last count).
   No other secret changes. Once Argo applies it, the `config-reloader`
   sidecar of the `jetstream` StatefulSet reloads NATS within about a minute
   (Kubernetes refreshes the mounted Secret, the sidecar sends SIGHUP); no
   restart, and connected clients stay connected.
2. **CRM database.** Deploy the migration with the normal CRM release
   (`prisma migrate deploy`; see `PRISMA_MIGRATION_RECONCILIATION.md` first if
   production history has not yet been reconciled).
3. **Bridge image.** The **Public API image** workflow builds it on the push
   to `main` (the image also bundles `src/lib/public-forms/submission.ts`; it
   can be run by hand too) and records the digest; let Argo sync
   `seawatch-api`. The `initialize-event-streams` sync hook runs
   `--initialize`, which now also creates the three form streams and
   `SEAWATCH_FORM_COUNTS` (existing streams are left untouched).
4. **CRM consumer.** No new service: the existing `event-registrations`
   service (infrastructure CRM role) runs `scripts/consume-event-registrations.ts`,
   which now starts the shared intake consumer, so the CRM release deploys it.
   Logs should show `Event registrations: consumer started.` and, once steps 1
   and 3 are live, `Form submissions: consumer started.` Until then the forms
   pipeline logs `consumer unavailable, retrying` without affecting event
   registrations. Renaming the service (e.g. `public-intake`) is optional.
5. **Enable** the intended team(s) as above.
6. **Verify** with an OPTIONS preflight only:

   ```sh
   curl -si -X OPTIONS -H 'Origin: https://sea-watch.org' \
     -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: Content-Type, Idempotency-Key' \
     https://api.sea.watch/v1/forms/submissions
   ```

   Expect 204 with the exact allow-origin. Review
   `SEAWATCH_FORM_SUBMISSION_FAILURES` periodically; it is not drained
   automatically.

`PUBLIC_EVENTS_ORIGINS` is unchanged.

## Tests

`tests/public-forms.test.ts` (schema, service, consumer) and
`tests/public-api-forms.test.ts` (bridge routes, stream initialization, NATS
authorization example) run the real modules with database and NATS boundaries
mocked.
