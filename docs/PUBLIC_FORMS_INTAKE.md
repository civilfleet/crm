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
| 400 `{"reason":"missing\|malformed\|invalid\|expired\|used"}` | Captcha not solved (when required, or when sent) |
| 429 + `Retry-After: 3600` | Per-source form budget exhausted: `RATE_LIMIT_PER_HOUR` (300) per hour (separate from events) |
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
| Failed / needs review (limits, 256 MiB) | `SEAWATCH_FORM_SUBMISSION_FAILURES` | `seawatch.forms.submissions.failed.v1` |
| Rate limit (`RATE_LIMIT_PER_HOUR`, default 300 msgs/subject, discard_new_per_subject, max_age 1h; also used by confirmations) | `SEAWATCH_FORM_RATE_LIMIT` | `seawatch.ratelimit.forms.<sha256(key:ip)>` |

Message: `{"version":1,"submissionId","receivedAt","submission":{…body…}}`,
published with `msgID = <submissionId>:<sha256(JSON.stringify(submission))>`
so identical retries within 24 h are deduplicated by the broker.

Durable consumer `crm-form-submissions-v1`: explicit ack, ack_wait 60 s,
max_ack_pending 1, unlimited redelivery. The consumer creates it on first start.

All streams reserve their `max_bytes` against the server's `max_file_store`
(4 GB in `deploy/seawatch-api/kubernetes/jetstream.yaml`); a stream that does
not fit is refused and `--initialize` stops there. The bridge tests keep the
total under 90% of it.

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
proposals as pending, applied or rejected. They are reviewed on the contact
("Pending changes") and for the whole team under CRM → Pending changes; see
`docs/DATA_RULES.md`, "Proposed changes".

Migration: `prisma/migrations/20261112120000_public_form_submissions`.

## Checking against the published form

The browser sends the submission, so anyone can change it. Before writing
anything, the intake consumer reads the form's published file
(`<PUBLIC_WEBSITE_URL>/forms/<formId>/<locale>.json`, cached 5 minutes) and
checks the submission against it (`src/lib/public-forms/verify.ts`):

- **Another team's form:** the file names a different team than the
  submission; it is refused and moved to the failed stream.
- **Consent purposes** hold only when the published form has a consent
  question with that id and purpose (in today's file, whatever version the
  person saw). Otherwise the answer stays an answer and no consent is
  recorded, and the submission does not ask for confirmation because of it.
- **Wording:** for the published version, the stored labels (and so the
  consent wording) are the published ones.
- **Everything else is recorded, not refused**, so a real person's
  submission is never lost: unknown questions, options the form does not
  offer, and missing required answers (questions shown only after certain
  answers may be missing) make the result `mismatch`, with notes.

The result is stored on the submission (`verification`: `verified`,
`mismatch`, `other-revision` when sent with another version, `unpublished`
when there is no file) and shown in the Forms page's "Checked" column, with
the notes as a tooltip. If the website cannot be read, the submission waits
and is retried (up to 10 deliveries, then the failed stream). Without
`PUBLIC_WEBSITE_URL` nothing is checked.

## Forms page and public counter

**Forms page** (CRM → Forms, `src/services/forms`): one row per form id the
team received, named by its newest title, with submissions, people (unique
contacts) and the last received date. A form's page lists its submissions
with one column per question, linking to each contact. Like every contact
list, it shows only submissions of contacts the user may see (group
visibility), trashed contacts included.

Each submission keeps the contact details as submitted (`contactAnswers`,
with the form's own labels), whatever happened to the contact: filled,
proposed for review, or already the same. The submissions table shows them
as columns marked "→ contact", next to one column per other question.

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

## Captcha

Website forms and event registrations can be protected with a proof-of-work
captcha (ALTCHA, `src/lib/public-forms/captcha.ts`), checked by the bridge
only; nothing of it reaches the queue or the CRM, and no third party is
involved.

1. The widget (ALTCHA 3.x) fetches a puzzle from `GET /v1/challenge`
   (also served as `/v1/forms/challenge`; `PBKDF2/SHA-256`, signed with
   `CAPTCHA_KEY`, valid 10 minutes, `Cache-Control: no-store`; 404 without a
   key). One endpoint serves both routes.
2. It solves it in the browser while the person fills in the form, usually
   in well under a second.
3. The submission or registration carries the result in the `X-Altcha`
   header (base64 JSON `{challenge, solution}`); the preflight of both
   routes allows it.
4. The bridge checks signature, expiry and proof, then records the puzzle in
   `SEAWATCH_CAPTCHA_USED` (message id = its signature, 20-minute duplicate
   window), so each puzzle lets one submission through.

Each route has its own switch on the bridge, so each website form is rolled
out on its own: `CAPTCHA_MODE_FORMS` (formerly `CAPTCHA_MODE`, still read as
a fallback) and `CAPTCHA_MODE_EVENTS`, each `off` (default; not checked),
`optional` (checked when sent; for the website rollout) or `required`. The
difficulty is shared configuration, raised during an attack without a
website change: `CAPTCHA_COST` (PBKDF2 iterations per attempt, default 5000)
and `CAPTCHA_MIN_COUNTER` / `CAPTCHA_MAX_COUNTER` (the answer lies between
them, default 2000–6000). The deployment sets the counters to 6000–18000 (about 3 s on a normal phone,
solved while the form is filled in).

**Per-source limits, ready for CGNAT.** Mobile carriers put many customers
behind one IPv4 address, so a viral petition must not hit the per-IP limit:
it is `RATE_LIMIT_PER_HOUR` (default 300) submissions per source and hour,
for forms and event registrations each, set on the `initialize-event-streams`
job in `api.yaml`; raise it there and sync, and the job updates the existing
streams. A source is an IPv4 address, or an IPv6 `/64` (one connection
usually has a whole `/64`, so single addresses would be no brake;
`src/lib/public-intake/rate-limit.ts`). The captcha, not this limit, keeps
scripts out; it only stops one machine from flooding.

## Confirmation (double opt-in)

A submission asks for e-mail confirmation when its form says
`form.confirmation: "email"`, or when a consent answer with a purpose is
ticked (marketing consent always needs a confirmed address). Asking is a
request, not a rule: a forged submission without it is simply never
confirmed, and everything that depends on confirmation filters on
`confirmedAt` in the CRM.

```
CRM intake consumer ──every 30 s──▶ confirmation e-mail (SMTP)
  text: <PUBLIC_WEBSITE_URL>/forms/<formId>/<locale>.json  (published by the website build)
  link: <PUBLIC_WEBSITE_URL>/<locale>/form-confirmation#<submissionId>.<signature>
website page ──POST /v1/forms/confirmations {"token"}──▶ bridge (checks the signature)
  ──JetStream seawatch.forms.confirmations.v1──▶ CRM consumer: confirmedAt, consents GRANTED
```

- **The e-mail text** comes from the form in Strapi, through the static file
  the website build publishes per form and language (sea-watch-nuxt
  `doc/cms-forms.md`). The CRM reads it from `PUBLIC_WEBSITE_URL`, its own
  configuration, never from a submission, so nobody can choose what we
  e-mail. A form without its own text uses a default per language (it, de,
  en). The text is plain text, escaped; only `{{name}}` is replaced. It sits
  in a fixed layout with the button, the link and a footer
  (`src/lib/public-forms/confirmation-email.ts`). If the site cannot be read,
  the e-mail waits and is retried.
- **How it is sent:** through the team's Scaleway Transactional Email when
  it is enabled and its sender verified (Team Settings → Integrations), with
  that sender; otherwise through the CRM's SMTP. Scaleway is built for
  volume; a petition's confirmations should go through it.
- **Limits** (`src/services/form-confirmations`, set with
  `FORM_CONFIRMATION_*` on the intake consumer): every submission that asks
  for confirmation gets its own e-mail, since only its own link proves it
  came from the address's owner (signing again included).
  - `PER_HOUR` (default 1000) in total and `BATCH` (100) per round, every
    `FORM_CONFIRMATION_INTERVAL_MS` (10 s), `CONCURRENCY` (5) at a time.
    Raise them for a campaign, within the Scaleway quota.
  - `PER_ADDRESS_PER_DAY` (3) across forms, against e-mail bombing; beyond
    it nothing is sent and the submission expires.
  - `PER_SOURCE_PER_HOUR` (30): per sender as the bridge counts it (the
    envelope's `source`, a keyed hash of the IPv4 address or IPv6 `/64`,
    never the address), so one machine cannot use up the hourly budget.
    Beyond it e-mails wait for the next hour rather than being dropped, so
    people behind a shared mobile address still get theirs.
- **The token** is `<submissionId>.<HMAC-SHA256>`, signed with
  `FORM_CONFIRMATION_KEY`, which the CRM and the bridge share. It sits in the
  URL fragment, so it reaches no server log. The bridge answers `202` for a
  valid signature (`400` otherwise, `503` without the key) and queues it once
  per submission (24 h deduplication); it shares the per-IP budget of form
  submissions.
- **Confirming** sets `confirmedAt` and writes a `GRANTED` consent for each
  pending one, at the confirmation time. A confirmation for a removed or
  already confirmed submission changes nothing.
- **Removal:** never confirmed within 7 days, the submission is removed with
  its pending consents, engagement and open proposals, and the contact if
  only that submission made it (`docs/DATA_RULES.md`).
- **Counting:** the Forms page shows confirmed people; the public counter
  counts only them when "Count only confirmed people" is on.

Configuration: the CRM consumer needs `PUBLIC_WEBSITE_URL`
(`https://sea-watch.org`, or the staging site) and `FORM_CONFIRMATION_KEY`,
plus the SMTP settings it already uses (`SMTP_FROM`); without the first two
it sends nothing and logs a warning. The bridge needs the same
`FORM_CONFIRMATION_KEY` in Secret `seawatch-api-env` (optional there: the
route answers 503 until it is set).

## Enabling a team

Teams are opted out by default. A team admin switches it on in **Team
Settings → Integrations → Website forms** ("Accept submissions from website
forms"); the card also shows the team id that a form's CRM destination in
Strapi needs. Each change is written to the team's system log
(`WEBSITE_FORMS`). While it is off, submissions for the team are moved to the
failed stream for review instead of being added.

The same by SQL, for teams without an admin at hand:

```sql
UPDATE "Teams" SET "publicFormsEnabled" = true WHERE id = '<team uuid>';
```

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
