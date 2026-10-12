# Email Production Readiness

This is the living implementation and rollout checklist for CRM inbound email,
inbox replies, and bulk email sending. Update an item only after its code,
automated checks, and any required live verification have completed.

## Status legend

- `BLOCKED`: must be resolved before production enablement
- `IN PROGRESS`: implementation or verification is underway
- `READY FOR LIVE TEST`: static validation is complete; provider/runtime proof is pending
- `DONE`: implementation and the required verification are complete
- `DECISION NEEDED`: product or operational policy must be agreed

## Current gate

**Production enablement remains blocked.** Do not configure real inboxes or
enable CRM bulk sending until all P0 items are `DONE` and the live rollout
checklist has passed with a dedicated test mailbox and test recipients.

The database configured by this checkout has six current migrations present in
the schema but absent from Prisma history and seven nullable tag columns that
should be non-null. Historical rows predating the intentional consolidated
baseline remain in the database and do not need their deleted migration files
restored. Confirm that this managed database is the one used by the deployed
containers, then complete
`docs/PRISMA_MIGRATION_RECONCILIATION.md` before any migration deployment.

## Work items

| ID | Priority | Status | Issue | Completion evidence |
| --- | --- | --- | --- | --- |
| EMAIL-001 | P0 | DONE | Bulk send, history, retry, and internal-copy operations enforce contact and actor visibility at the service boundary. | Authorization regression tests, typecheck, focused Biome check, and production build passed on 2026-10-05. Live role-matrix smoke testing remains part of rollout. |
| EMAIL-002 | P0 | DONE | Batch and recipient creation is atomic so the worker cannot claim an incomplete batch. | Transaction-boundary test, typecheck, focused Biome check, and production build passed on 2026-10-05. |
| EMAIL-003 | P0 | READY FOR LIVE TEST | Bulk recipients and internal reports are durably claimed before provider I/O; ambiguous outcomes become non-retryable `UNKNOWN`. Inbox replies use a persistent client request key and dispatch record. | Crash-window regression tests passed on 2026-10-05. Apply the migration, run controlled Scaleway/SMTP sends, and complete an `UNKNOWN` reconciliation drill before marking `DONE`. |
| EMAIL-004 | P0 | READY FOR LIVE TEST | Inbound mail is contact-matched only when a trusted `Authentication-Results` service reports DMARC pass. Failed, missing, or untrusted evidence is stored without contact linkage and logged as quarantined. | Parser fixtures pass. Configure `INBOUND_EMAIL_TRUSTED_AUTHSERV_IDS`, apply the migration, and complete live pass/fail/spoof tests before marking `DONE`. |
| EMAIL-005 | P0 | READY FOR LIVE TEST | The production deployment definition pins one supplied tag across migration, web, and worker images; migration failure stops rollout and the worker has `unless-stopped`. The application now records heartbeat and eligible email queue depth/age in the shared database, with a failing health command for stale heartbeat or queue lag. | Schema validation, threshold tests, typecheck, focused Biome, and production build passed on 2026-10-05. Apply the heartbeat migration, wire the health command into production monitoring, deploy one pinned tag, and verify it live before marking `DONE`. |
| EMAIL-006 | P1 | READY FOR LIVE TEST | Saving Scaleway settings invalidates prior verification. Sender verification now checks the exact project/domain through the Scaleway API and requires domain status `checked`; settings and inbox test actions submit a real test message to the signed-in administrator. | Provider-response and real-send-path regression tests, typecheck, focused Biome, and production build pass. Complete verification and controlled delivery with production credentials before marking `DONE`. |
| EMAIL-007 | P1 | READY FOR LIVE TEST | A fail-closed Scaleway SNS receiver validates the allowed topic, rotating signing certificate against Scaleway's configured trust chain, and message signature. Delivery/hard-failure states are replay-safe; hard bounces and spam suppress future batches. Admins can record unsubscribe/manual suppressions. Marketing use is explicitly blocked pending consent and one-click unsubscribe support. | Signed-envelope, rejection, replay, bounce, suppression, typecheck, focused Biome, and production-build checks pass. Configure SNS/trust secrets, apply the migration, and run live delivery/bounce/spam/suppression tests before marking `DONE`. |
| EMAIL-008 | P1 | READY FOR LIVE TEST | Scaleway, Klaviyo, and Zammad API keys plus the Zammad webhook secret are encrypted at rest with an independent, versioned AES-256-GCM keyring. Legacy plaintext is migration-compatible and the rotation command rewraps all secrets atomically. | Encryption, tamper, plaintext-compatibility, and old-to-new-key rotation tests, typecheck, focused Biome, and production build passed. Configure the production keyring, run the transactional rotation, and smoke-test every integration before marking `DONE`. |
| EMAIL-009 | P1 | DONE | IMAP import/checkpoint behavior, inbox reply ambiguity, batch retry ownership, real outbound test dispatch, and access-review scoping have automated integration coverage. | Happy-path import, team mismatch, retry/uncertain delivery, UID reset, and access-boundary tests plus typecheck, focused Biome, and production build passed on 2026-10-05. |
| EMAIL-010 | P1 | READY FOR LIVE TEST | Inbound and reply attachments use private storage, authenticated downloads, secure global blocklist defaults, inline safe raster images, provider-specific limits, and retry-safe IMAP checkpoints. Replies honor the first valid `Reply-To` with a visible warning. Sent replies remain CRM-only. | Migration/schema validation, attachment-policy, storage-failure, `Reply-To`, idempotency/security, provider, typecheck, focused Biome, and production-build checks pass. Apply the migration and complete live IMAP/S3/SMTP/Scaleway attachment tests before marking `DONE`. |
| EMAIL-011 | P1 | READY FOR LIVE TEST | Scaleway, Klaviyo, Zammad, IMAP, and inbox SMTP operations have configurable bounded deadlines. Worker health now fails on eligible Zammad queue lag and stale enabled-inbox syncs in addition to bulk-email queue lag. | Timeout configuration and health-threshold tests, schema validation, typecheck, focused Biome, and production build passed. Apply the heartbeat extension migration and verify timeout/lag alerts live before marking `DONE`. |
| EMAIL-012 | P1 | READY FOR LIVE TEST | Production startup rejects missing or invalid global SMTP host, credentials, sender, port, and TLS-mode configuration. Global SMTP also uses bounded connection, greeting, and socket deadlines. | Startup configuration tests, typecheck, focused Biome, and production build passed. Complete live magic-link and application-email smoke tests before marking `DONE`. |
| EMAIL-013 | P0 | BLOCKED | The production Compose template does not yet pass the security and operational environment added by EMAIL-004, EMAIL-005, EMAIL-007, EMAIL-008, EMAIL-010, and EMAIL-011, and the worker has no health check. | Update and apply the infrastructure role, then inspect the rendered container configuration without exposing secrets and prove the worker health alert path. This change belongs to the separate `datacenter-infra` repository. |

## Baseline validation (2026-10-05)

- `yarn typecheck`: passed.
- `yarn next build --webpack`: passed outside the restricted sandbox; existing
  Handlebars `require.extensions` warnings remain.
- `yarn lint`: passed with one existing unused `toBigInt` warning in the inbound
  email service.
- `yarn test`: 24/25 passed in the restricted sandbox; the isolated vCard test
  passed outside the sandbox, confirming a subprocess restriction rather than a
  product failure.
- No live IMAP, SMTP, Scaleway, DNS, bounce-webhook, migration, or deployed-worker
  verification has been performed.

## Live rollout checklist

- [ ] Reconcile production migration history using
      `docs/PRISMA_MIGRATION_RECONCILIATION.md`, then apply and verify all
      pending email-related Prisma migrations.
- [ ] Update the production infrastructure role to pass the new encryption,
      inbound-auth, SNS, timeout, attachment-policy, and worker-health settings
      to web and worker containers; add the worker health check and monitoring.
- [ ] Deploy the web image and matching tools/worker image from the same commit.
- [ ] Configure `INTEGRATION_SECRET_ENCRYPTION_KEYS` in web and worker, run
      `yarn secrets:rotate-integrations`, and complete the smoke tests in
      `docs/INTEGRATION_SECRET_ROTATION.md`.
- [ ] Set a dedicated, stable `INBOUND_EMAIL_ENCRYPTION_KEY` in both services.
- [ ] Add `yarn worker:health` as the worker container health check, alert on
      unhealthy state, and confirm bulk-email, Zammad, and inbox-sync lag
      thresholds live.
- [ ] Verify global SMTP with a magic-link login and one application email.
- [ ] Configure a dedicated non-production IMAP/SMTP mailbox.
- [ ] Set `INBOUND_EMAIL_TRUSTED_AUTHSERV_IDS` to the receiving mail system's
      exact Authentication-Results service IDs and confirm it removes or safely
      orders sender-injected Authentication-Results headers.
- [ ] Test authenticated inbound mail, failed-authentication mail, UID replay,
      checkpoint reset, HTML sanitization, and access-review behavior.
- [ ] Test allowed, blocked, inline, and oversized inbound attachments; confirm
      every manual inbound download warns and an S3 failure retries the same UID.
- [ ] Send controlled replies through each enabled outbound mode and verify
      threading, sender identity, duplicate protection, and failure recovery.
- [ ] Verify differing `Reply-To` display/delivery plus 10 MiB per-file, 25 MiB
      SMTP-message, and 2 MiB Scaleway-payload attachment boundaries live.
- [ ] Send a controlled bulk batch and verify authorization, personalization,
      delivery events, bounce suppression, and history visibility.
- [ ] Configure the Scaleway SNS topic allowlist and trust-chain secret, then
      verify signed delivery, hard-bounce, spam, replay, and subscription events.
- [ ] Confirm operators understand `docs/EMAIL_SENDING_POLICY.md`; keep
      marketing/promotional sends disabled until consent and one-click
      unsubscribe support are implemented.
- [ ] Confirm SPF, DKIM, and DMARC for every production sender domain.
- [ ] Record rollback steps and disable switches for inbox sync and sending.

## Progress log

### 2026-10-05

- Completed the initial end-to-end code and deployment-readiness audit.
- Confirmed the baseline static validation results above.
- Started `EMAIL-001` with service-level authorization as the first remediation.
- Completed `EMAIL-001`: direct recipients now use the caller's contact
  visibility, event-derived recipients are filtered to visible contacts,
  internal reports require team-admin access, and non-admin history/retries are
  scoped to batches created by that user. Added focused authorization tests;
  typecheck, focused Biome, isolated/full tests, and the production build passed
  (the known sandbox-only vCard runner limitation was verified separately).
- Started `EMAIL-002` by moving batch and recipient publication into one database
  transaction.
- Completed `EMAIL-002`: the batch and its full recipient set are now committed
  in one transaction, including skipped-recipient state. Added a transaction-
  boundary regression test; typecheck, focused Biome, the full test set (subject
  to the documented vCard sandbox limitation), and the production build passed.
- Next implementation target: `EMAIL-003` provider-send idempotency and crash
  recovery.
- Implemented the static portion of `EMAIL-003`. Bulk recipients and internal
  report recipients now move from `PENDING` to `DISPATCHING` before provider
  I/O. A transport ambiguity, interrupted dispatch, or provider-acceptance/DB-
  persistence crash becomes `UNKNOWN` and is never automatically retried.
- Inbox replies now require a client-generated idempotency key. A durable reply
  dispatch record deduplicates concurrent/repeated requests, and stale dispatches
  are moved to `UNKNOWN` by the worker recovery pass. The engagement and final
  dispatch state are committed together after provider acceptance.
- Added the `20261005000000_add_email_dispatch_idempotency` migration and crash-
  window regression tests proving a second attempt does not call the provider.
- `EMAIL-003` is ready for a controlled live provider/reconciliation test. The
  next code implementation target is `EMAIL-004` inbound sender authentication.
- Implemented the static portion of `EMAIL-004`. Only DMARC pass results from an
  explicitly trusted authentication service can trigger contact matching,
  contact creation, access review, or engagement creation. Other messages remain
  stored for audit, are not exposed as contact activity, and generate a
  quarantine system log. Added pass, fail, forged-header, and missing-evidence
  fixtures. Live mailbox-header verification is still required.
- Next implementation target: `EMAIL-005` production worker verification.
- Verified the external production Compose/deploy definitions for `EMAIL-005`:
  the deploy script requires a concrete image tag, uses it for migration, web,
  and worker images, aborts after a failed migration, and recreates both runtime
  services. The worker has `restart: unless-stopped` and the same shared database
  configuration as the web process.
- Added a durable database heartbeat containing eligible email queue depth and
  oldest-queued time. `yarn worker:health` exits non-zero for a missing/stale
  heartbeat or excessive queue lag. Added the
  `20261005020000_add_background_worker_heartbeat` migration and threshold tests.
  Live deployment, health-check wiring, and alert evidence remain required.
- Next implementation target: `EMAIL-006` real provider and sender verification.
- Implemented the static portion of `EMAIL-006`. Saving Scaleway settings no
  longer reports readiness and clears any earlier verification timestamp. A
  dedicated admin action queries Scaleway for the exact configured project and
  sender domain and accepts only `checked` status. Separate test actions submit
  real messages to the signed-in administrator through the saved Scaleway
  integration or the inbox's configured SMTP/Scaleway outbound path.
- Added provider response, credential-error redaction, unverified-domain, and
  real inbox-send-path regressions. Production credentials and mailbox receipt
  still need live proof.
- Next implementation target: `EMAIL-007` delivery/bounce ingestion and sending
  policy.
- Implemented the static portion of `EMAIL-007`. A public Scaleway SNS endpoint
  verifies an exact topic allowlist, restricts certificate and subscription URLs
  to the expected regional Scaleway hosts, validates the rotating leaf against
  the configured long-term trust chain, and verifies the SNS signature before
  parsing TEM events. Event IDs are persisted for replay safety.
- Delivered messages move from `SENT` to `DELIVERED`; hard drops, missing
  mailboxes, blocklist events, and spam move eligible recipients to `BOUNCED`
  and add a team suppression. Batch counters are recalculated, future batches
  skip suppressed addresses, and retries no longer requeue bounced recipients.
- Added an admin suppression panel for unsubscribe and manual blocks plus
  `docs/EMAIL_SENDING_POLICY.md`. Promotional/marketing use is explicitly out of
  scope until explicit consent and a recipient-facing one-click unsubscribe flow
  exist. Live SNS subscription, delivery, bounce, and suppression proof remains.
- Implemented the static portion of `EMAIL-008`. Integration API keys and the
  Zammad webhook secret now use authenticated encryption with a dedicated,
  ordered keyring. Reads remain compatible with legacy plaintext while all
  settings writes use the active key.
- Added `yarn secrets:rotate-integrations`, which validates every existing
  secret before writing, detects concurrent edits, and rotates all records in a
  single transaction. Added the production rotation runbook and encryption,
  tamper, compatibility, and key-rewrap tests. Live key configuration, database
  rotation, and provider smoke tests remain.
- Completed `EMAIL-009` with an end-to-end authenticated IMAP import fixture,
  cross-team inbox-claim rejection, access-review query scoping, and coverage of
  the existing reply ambiguity, retry authorization, and real outbound test
  paths. The tests exposed and fixed a UID reset defect: a changed IMAP
  `UIDVALIDITY` now clears the old checkpoint even when the mailbox is empty, so
  later low-numbered UIDs cannot be skipped.
- Next implementation target: `EMAIL-011` bounded provider timeouts and worker
  loop health. `EMAIL-010` remains a product decision.

### 2026-10-06

- Implemented the static portion of `EMAIL-011`. CRM-owned Scaleway, Klaviyo,
  and Zammad HTTP calls now abort after a configurable deadline; inbox IMAP and
  SMTP clients have explicit connection, greeting, and socket timeouts.
- Extended the durable worker heartbeat with eligible Zammad queue depth/age and
  enabled-inbox sync age. The health command now fails for either new lag class.
  Live migration, deliberate timeout tests, and production alert proof remain.
- Next implementation target was `EMAIL-012` global SMTP startup validation;
  the `EMAIL-010` decisions were finalized afterward.
- Implemented the static portion of `EMAIL-012`. Production no longer silently
  falls back to localhost SMTP: missing host, username, password, or sender and
  invalid port/TLS settings now fail during configuration loading. A completely
  unconfigured development environment retains the local non-delivering
  fallback. Live magic-link and application-email delivery proof remains.
- Completed the static portion of `EMAIL-010`. Inbound MIME attachments are
  stored in private object storage with deterministic retry keys; blocked types
  remain visible as blocked metadata, safe CID raster images render through an
  authenticated route, and every manual inbound download requires a malware
  warning acknowledgement. Storage failure does not advance the UID checkpoint.
- Reply attachments use scoped pending uploads, become CRM attachment records in
  the same transaction as sent history, and participate in the idempotency hash.
  SMTP enforces 10 MiB per file and a 25 MiB encoded-message limit; Scaleway
  enforces its supported MIME set and 2 MiB encoded API payload. Both cap replies
  at 10 attachments.
- The first valid `Reply-To` is stored separately from the authenticated `From`
  identity and used by the server, with a warning in both reply interfaces when
  they differ. Sent replies remain CRM-only by product decision.
- Remaining unresolved items require controlled live rollout evidence.
- Read-only migration inspection found historical database rows for migrations
  intentionally superseded by the consolidated 2026 baseline. Their deleted
  SQL files must remain deleted: restoring them ahead of the baseline would
  make clean database creation fail on duplicate objects. Prisma production
  deployment ignores applied migrations missing from the filesystem, so those
  legacy history rows do not require modification.
- A deeper read-only schema preflight on 2026-10-07 found that all objects from
  the six July-September migrations already exist even though their Prisma
  history entries are absent. Every expected column, index, foreign key,
  primary key, and enum label is present. The seven tag-array columns are the
  only detected mismatch: they are nullable instead of `NOT NULL`, but contain
  zero null values. The reconciliation runbook now repairs that constraint and
  records those six migrations as applied before deploying the six genuinely
  pending October email migrations.
- Target identity is not yet proven: this checkout uses managed PostgreSQL,
  while the current Ansible role defines an internal PostgreSQL container. A
  read-only SSH check failed at authentication. No database row, constraint, or
  migration-history record was changed.

## Production worker deployment handoff

Static inspection of the production infrastructure repository on 2026-10-05
confirmed that its deployment script accepts a required image tag, exports that
tag for all Compose operations, runs `prisma migrate deploy`, checks the migration
container exit code, persists the tag, and then recreates both `app` and `worker`.
The worker uses the tools image with the same tag and database configuration as
the web app, starts `scripts/background-worker.ts`, and has
`restart: unless-stopped`.

The production Compose template currently exposes only the legacy SMTP and S3
settings. It must be extended in the infrastructure repository to pass the new
email settings to both runtime services and make the worker run this probe after
the heartbeat migration has been applied:

- required secrets and trust policy:
  `INTEGRATION_SECRET_ENCRYPTION_KEYS`, `INBOUND_EMAIL_ENCRYPTION_KEY`,
  `INBOUND_EMAIL_TRUSTED_AUTHSERV_IDS`, `SCALEWAY_EMAIL_SNS_TOPIC_ARNS`, and one
  of `SCALEWAY_SNS_TRUST_CHAIN_PEM` or
  `SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64`;
- explicit SMTP and provider policy: `SMTP_REQUIRE_TLS`,
  `EMAIL_PROVIDER_REQUEST_TIMEOUT_MS`, `EMAIL_CONNECTION_TIMEOUT_MS`,
  `EMAIL_GREETING_TIMEOUT_MS`, and `EMAIL_SOCKET_TIMEOUT_MS`;
- worker scheduling and monitoring: `BACKGROUND_WORKER_HEARTBEAT_INTERVAL_MS`,
  `BACKGROUND_WORKER_HEALTH_MAX_AGE_MS`,
  `BACKGROUND_WORKER_EMAIL_QUEUE_MAX_LAG_MS`,
  `BACKGROUND_WORKER_ZAMMAD_QUEUE_MAX_LAG_MS`, and
  `BACKGROUND_WORKER_INBOX_SYNC_MAX_LAG_MS`;
- inbound limits and policy, when overriding the secure defaults:
  `INBOUND_EMAIL_SYNC_INTERVAL_MS`, `INBOUND_EMAIL_SYNC_LIMIT`,
  `EMAIL_INBOUND_MAX_MESSAGE_BYTES`, `EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS`, and
  `EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES`.

```yaml
healthcheck:
  test:
    ["CMD", "node", "--import", "tsx", "scripts/check-background-worker-health.ts"]
  interval: 30s
  timeout: 10s
  retries: 4
  start_period: 60s
```

Set `BACKGROUND_WORKER_HEALTH_MAX_AGE_MS` and
`BACKGROUND_WORKER_EMAIL_QUEUE_MAX_LAG_MS`,
`BACKGROUND_WORKER_ZAMMAD_QUEUE_MAX_LAG_MS`, and
`BACKGROUND_WORKER_INBOX_SYNC_MAX_LAG_MS` in the worker environment if the
defaults of two and five minutes are not appropriate. Provider deadlines can be
tuned with `EMAIL_PROVIDER_REQUEST_TIMEOUT_MS`, `EMAIL_CONNECTION_TIMEOUT_MS`,
`EMAIL_GREETING_TIMEOUT_MS`, and `EMAIL_SOCKET_TIMEOUT_MS`. Alert on the Compose
health state; a healthy result is emitted as one JSON line for operational
evidence. The production template must also pass the dedicated
`INBOUND_EMAIL_ENCRYPTION_KEY` and `INBOUND_EMAIL_TRUSTED_AUTHSERV_IDS` described
in the rollout checklist before inbound mail is enabled.

## Delivery ambiguity policy

Scaleway's documented send endpoint does not expose an idempotency key. The CRM
therefore favors preventing duplicate mail over automatic retry when it cannot
prove whether a provider accepted a request:

- `FAILED` means the provider definitively rejected the request and is retryable.
- `UNKNOWN` means acceptance is possible. It is not retryable until an operator
  verifies the provider/mailbox outcome and deliberately reconciles it.
- A repeated inbox-reply request with the same idempotency key returns the
  already-created engagement when the original send completed, or HTTP `409`
  when the outcome is still uncertain.
