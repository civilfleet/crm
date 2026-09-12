# Security and technical-debt backlog

This document records the August 2026 code audit and the remediation order.
Priority reflects risk to production data and operations, not implementation
effort.

## P0 — immediate security and integrity work

- [x] Add shared organization, funding-request, and donation-agreement
  authorization helpers based on persisted team and organization membership.
- [x] Protect previously unguarded user, organization, funding, transaction,
  donation-agreement, contact metadata, event metadata, and admin activity API
  routes. Derive user roles for scoped invitations instead of accepting an
  arbitrary role from the request body.
- [x] Add an organization-level layout guard so changing an organization UUID
  in the URL cannot bypass membership checks.
- [x] Require a dedicated bearer secret for the reminder cron endpoint.
- [x] Replace unrestricted public presigned uploads with server-proxied,
  team-scoped uploads. Public registration uploads are limited to PDF, JPEG,
  PNG, or WebP files of at most 10 MB and are throttled per client and team.
- [x] Throttle public organization and event registrations. The current limiter
  is process-local and appropriate for the standalone deployment; move it to a
  shared store before horizontally scaling the web service.
- [x] Calculate transaction totals and remaining balances on the server inside
  a serializable database transaction. Ignore client-supplied organization,
  team, total, and remaining-balance values.
- [x] Bind donation-agreement signatures to the authenticated assigned signer.
  Administrators can no longer submit a signature on another person's behalf.
- [x] Require signed Zammad webhooks and fail closed when no webhook secret is
  configured.

## P1 — next security and reliability work

- [ ] Refresh privileged roles from the database, or introduce revocable and
  versioned sessions, so role removal takes effect before JWT expiry.
- [ ] Require verified OIDC email claims and review dangerous email-account
  linking for each configured identity provider.
- [ ] Encrypt OIDC client secrets and integration API/webhook secrets at rest
  with an independently rotatable key.
- [ ] Replace inline email side effects with an outbox and idempotent background
  jobs. Split unrelated worker loops and add heartbeat and queue-lag health
  checks.
- [ ] Move public rate-limit state to Redis or PostgreSQL before running more
  than one web replica. Add an object-storage lifecycle rule for abandoned
  `public-registrations/` objects.
- [ ] Replace hand-written application URLs with centralized route builders;
  several reminder and funding emails still contain legacy singular routes.
- [ ] Update the Server Action origin allowlist from the legacy Vercel hostname
  to the production CRM hostname.

## P2 — maintainability and performance

- [ ] Add authorization-matrix integration tests for anonymous, organization,
  team member, team admin, and global admin actors.
- [ ] Add Playwright smoke coverage for login, contacts, funding, agreement
  signing, transactions, and uploads. Run type checking, tests, Prisma
  validation, and Biome checks before image publishing.
- [ ] Split the largest client components and services by feature boundary and
  lazy-load optional editors, maps, and dialogs.
- [ ] Remove server-side HTTP calls to the application's own API in favor of
  direct authorized service calls.
- [ ] Deduplicate repeated authentication and current-user queries in nested
  layouts and pages.

## Required production configuration

- Set `CRON_SECRET` to a dedicated high-entropy value and configure the
  scheduler to send it as a bearer token.
- Configure a non-public S3 bucket and restrict CORS to the production origin.
- Ensure the reverse proxy overwrites `X-Real-IP` and `X-Forwarded-For`, because
  the standalone public rate limiter uses those headers as its client key.
