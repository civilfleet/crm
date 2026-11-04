# CRM and Public Events

<!-- impeccable:product-schema 1 -->

## Platform

web

## Scope and Sources

This record covers the existing CRM and its separate public events application.
It captures repository facts and the product decisions confirmed in this
conversation. Additional audience priorities and requirements remain open below.
It does not establish a new visual direction.

## Users

- Team staff manage contacts, organizations, engagement, events and funding
  workflows within their team's permissions.
- Partner organization users maintain organization records and submit funding
  requests through the supported organization workflows.
- Platform administrators manage teams, organizations, access and configuration.
- Public visitors discover events, search upcoming and historical listings, read
  event details and, when intake is enabled, submit registration requests.

The first three roles are documented in `README.md`; public visitor workflows
are implemented in `public-events/`. The relative priority of these audiences
for future design work has not been specified.

## Product Purpose

Support relationships and operational workflows between provider teams and
partner organizations, with CRM and funding modules in one application.

Public events must remain accessible when the CRM is placed behind a corporate
VPN. Visitors should be able to find relevant events without downloading the
whole catalogue, including its historical records.

## Operating Context

The repository contains a Next.js App Router CRM and a separate static Next.js
application in `public-events/`. Both use React and TypeScript. The CRM uses
PostgreSQL through Prisma, S3-compatible storage, email services, and team OIDC
or email magic-link authentication.

Staff manage source records privately. A publisher exports approved public event
fields for configured teams and builds static pages for Netlify. Public browsers
must not depend on reaching the private CRM directly.

The registration bridge accepts submissions into persistent JetStream storage;
a private consumer processes them into the CRM. Receiving a submission and
confirming a registration are separate states. UI copy must preserve that
distinction and explain when online registration is unavailable.

## Capabilities and Constraints

- CRM capabilities include contacts, organizations, lists, groups, engagement
  history, events and event roles, email workflows and document handling.
- Funding capabilities include requests, agreements, signatures, transactions
  and receipts. Preserve existing workflow states and authorization boundaries.
- Public event pages include upcoming listings, historical archives, stable
  detail URLs, text search and event filters. Geographic filtering uses postal
  centroids and geohash shards; it is not precise address geolocation.
- Static publication and its delay are accepted tradeoffs. Public UI must not
  imply that a published snapshot is a live view of private records.
- Large catalogues must use incremental loading and search/index shards rather
  than adding every event to the initial browser payload.
- Export only explicitly public events for allowed teams. Private CRM records,
  contact details, registrations and credentials must not enter static assets.
- Preserve private team/group access rules and application role boundaries.
- Keep registration requests retryable without creating duplicate submissions.
  Do not show confirmation merely because the queue accepted a request.
- Existing CRM and storage hostnames are to be retained during infrastructure
  migration. Hosting changes must preserve intended public/private access.
- Registration intake and automated publication have implementation and
  deployment prerequisites. Their presence in code is not evidence that they
  are enabled or operational in production; verify before changing user copy.

## Brand Commitments

The configured public events publication uses the Sea-Watch name. The user
subsequently selected https://sea-watch.org/ as the visual authority for the
static public events pages, replacing their earlier cream-and-green styling.
Preserve the main site's identity during refinement unless a redesign is requested. Existing code and assets provide its visual evidence; this document
does not prescribe a new palette, type system or page composition.

CRM naming is configurable through `NEXT_PUBLIC_APP_NAME`; avoid assuming all
teams use the public event publication's identity.

## Evidence on Hand

- `README.md`: domain, supported roles, CRM and funding capabilities.
- `src/app/`, `src/components/` and `prisma/schema.prisma`: existing private
  workflows, permissions, data model and public routes.
- `public-events/`: incumbent static public pages and registration states.
- `config/public-events.json`: configured publication site and team allowlist.
- `docs/PUBLIC_EVENTS_PUBLISHING.md`: publishing, search, archive, registration
  bridge and deployment requirements. Recorded deployment results are dated
  evidence, not a substitute for checking the current service.
- `tests/public-events.test.ts`: existing publication and registration checks.

No testimonials, usage figures, partnerships, outcome claims or marketing
benchmarks have been supplied for future interfaces to assert.

## Product Principles

1. Keep public discovery usable independently of private CRM availability.
2. Preserve the public pages' established identity and existing task workflows.
3. Let catalogue growth increase available content without increasing the
   initial payload proportionally.
4. Represent publication, submission receipt and confirmed registration
   accurately, including delays and unavailable states.
5. Protect private records and preserve team and role boundaries across every
   surface and export.

## Open Decisions

- Primary audience and highest-priority tasks for the next design change.
- Required languages and localization scope. Current document shells declare
  English; that does not establish a product language policy.
- Product-specific accessibility needs and any required conformance standard.
- Additional brand/voice requirements beyond preserving the original public
  pages' identity.

These remain undecided; do not invent answers or treat their absence as a
requirement to change existing behavior.
