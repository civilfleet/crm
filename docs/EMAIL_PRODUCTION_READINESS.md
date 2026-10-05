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

## Work items

| ID | Priority | Status | Issue | Completion evidence |
| --- | --- | --- | --- | --- |
| EMAIL-001 | P0 | DONE | Bulk send, history, retry, and internal-copy operations enforce contact and actor visibility at the service boundary. | Authorization regression tests, typecheck, focused Biome check, and production build passed on 2026-10-05. Live role-matrix smoke testing remains part of rollout. |
| EMAIL-002 | P0 | DONE | Batch and recipient creation is atomic so the worker cannot claim an incomplete batch. | Transaction-boundary test, typecheck, focused Biome check, and production build passed on 2026-10-05. |
| EMAIL-003 | P0 | READY FOR LIVE TEST | Bulk recipients and internal reports are durably claimed before provider I/O; ambiguous outcomes become non-retryable `UNKNOWN`. Inbox replies use a persistent client request key and dispatch record. | Crash-window regression tests passed on 2026-10-05. Apply the migration, run controlled Scaleway/SMTP sends, and complete an `UNKNOWN` reconciliation drill before marking `DONE`. |
| EMAIL-004 | P0 | BLOCKED | Inbound contact matching trusts the message `From` header without authentication-result policy. Quarantine or clearly isolate unauthenticated mail. | SPF/DKIM/DMARC fixture tests and a live spoof/failure test. |
| EMAIL-005 | P0 | BLOCKED | The production worker definition is external to this repository and has not been verified. | Deployed worker, migrations, shared database/key, restart policy, heartbeat, and queue-lag checks verified live. |
| EMAIL-006 | P1 | BLOCKED | Scaleway settings and the inbox "Test sending" action report readiness without a real provider/sender verification. | Provider API validation and a controlled test delivery succeed. |
| EMAIL-007 | P1 | BLOCKED | Delivery and bounce states are not ingested; suppression and unsubscribe/consent policy are absent. | Signed webhook tests, suppression behavior, and documented sending policy. |
| EMAIL-008 | P1 | BLOCKED | Integration API and webhook secrets are stored in plaintext. | Independently rotatable encryption plus migration/rotation test. |
| EMAIL-009 | P1 | BLOCKED | IMAP, inbox reply, queue, and access-review paths lack integration coverage. | Automated happy-path, mismatch, retry, UID reset, and access-boundary tests. |
| EMAIL-010 | P1 | DECISION NEEDED | Attachments, `Reply-To`, and Sent-folder behavior are not implemented. | Product decision recorded; accepted behavior implemented and tested where required. |
| EMAIL-011 | P1 | BLOCKED | Email/IMAP provider calls need bounded timeouts; unrelated worker loops need separate health and lag monitoring. | Timeout tests and production health/alert evidence. |
| EMAIL-012 | P1 | BLOCKED | Global SMTP configuration does not fail fast even though it powers magic-link login and application email. | Startup validation and live magic-link/application-email smoke tests. |

## Baseline validation (2026-10-05)

- `yarn typecheck`: passed.
- `yarn next build --webpack`: passed outside the restricted sandbox; existing
  Handlebars `require.extensions` warnings remain.
- `yarn lint`: passed with one existing unused `toBigInt` warning in the inbound
  email service.
- `yarn test`: 20/21 passed in the restricted sandbox; the isolated vCard test
  passed outside the sandbox, confirming a subprocess restriction rather than a
  product failure.
- No live IMAP, SMTP, Scaleway, DNS, bounce-webhook, migration, or deployed-worker
  verification has been performed.

## Live rollout checklist

- [ ] Apply and verify all email-related Prisma migrations.
- [ ] Deploy the web image and matching tools/worker image from the same commit.
- [ ] Set a dedicated, stable `INBOUND_EMAIL_ENCRYPTION_KEY` in both services.
- [ ] Confirm worker restart policy, heartbeat, queue lag, and error alerting.
- [ ] Verify global SMTP with a magic-link login and one application email.
- [ ] Configure a dedicated non-production IMAP/SMTP mailbox.
- [ ] Test authenticated inbound mail, failed-authentication mail, UID replay,
      checkpoint reset, HTML sanitization, and access-review behavior.
- [ ] Send controlled replies through each enabled outbound mode and verify
      threading, sender identity, duplicate protection, and failure recovery.
- [ ] Send a controlled bulk batch and verify authorization, personalization,
      delivery events, bounce suppression, and history visibility.
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
