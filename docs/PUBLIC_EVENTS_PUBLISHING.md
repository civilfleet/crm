# Public data publication

The Netlify target is a data feed, not an attendee website. The existing site ID
is retained; its intended name is `seawatch-public-data`, at
`https://seawatch-public-data.netlify.app`. The former `public-events/` frontend
source remains available for future UI work but is not built or uploaded.

All teams with public events are included automatically. There is no team ID
allowlist. Teams with no public events, including a team whose last event is
unpublished, disappear from discovery. Only explicit public event fields and
team ID/name/public email/website are exported. Registrations, contacts, internal
team settings and credentials are never exported.

## Consumer contract

Start at `/manifest.json`. It contains `schemaVersion`, the publication version
and timestamp, the shared `registrationApi`, paginated team discovery, and a link
to shared postal references. Team discovery has 50 entries per page. Every team
has a stable `/teams/<team-id>/manifest.json` linking its profile and scopes:

```text
manifest.json
teams/index/<directory-version>/1.json
teams/<team-id>/manifest.json
teams/<team-id>/events/<event-id>/manifest.json
teams/<team-id>/data/profile/<hash>.json
teams/<team-id>/data/events/<event-id>/<hash>.json
teams/<team-id>/data/listings/upcoming/<scope-version>/manifest.json
teams/<team-id>/data/listings/upcoming/<scope-version>/1.json
teams/<team-id>/data/listings/upcoming/<scope-version>/search/pagefind.js
teams/<team-id>/data/listings/upcoming/<scope-version>/geo/index.json
teams/<team-id>/data/listings/archive/<year>/<scope-version>/...
reference/postal/<reference-version>/manifest.json
```

URLs in JSON begin with `/` and are relative to the **feed origin**, not the
custom website. Follow the supplied links; do not construct hashed paths.
Public TypeScript contracts are in `src/lib/public-data/types.ts`.

### Resolving saved event links

Use the team and event UUIDs for durable website URLs. Each team manifest exposes
`eventLookupUrlTemplate`, for example
`/teams/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/events/{eventId}/manifest.json`.
Only `{eventId}` is a placeholder; the team UUID is already substituted.
Each public event's stable lookup returns exactly:

```json
{
  "schemaVersion": 1,
  "teamId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "eventId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "detailUrl": "/teams/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/data/events/cccccccc-cccc-4ccc-8ccc-cccccccccccc/<current-content-hash>.json"
}
```

Browser resolution:

1. Fetch the stable team manifest with `cache: "no-cache"` to revalidate it.
2. Expand its `eventLookupUrlTemplate` with the event UUID (URL-encoded).
3. Revalidate the lookup manifest with `cache: "no-cache"`, then fetch its
   `detailUrl` relative to the feed origin. Never construct a content hash or
   scan listing pages, archive years, or search indexes to resolve a UUID.
4. If that versioned detail returns HTTP 404, revalidate the team and lookup
   manifests and retry the detail fetch once. This handles publication between
   requests. Do not retry indefinitely or retain an old pointer as authoritative.
5. A 404 from the revalidated team or lookup manifest means the public event is
   unavailable (including deletion, unpublishing or a team without public events).
   Network failures, HTTP 429/5xx and invalid responses are service failures,
   not evidence of an unavailable event. If the detail is still missing after
   the one retry while its lookup exists, report a temporary feed inconsistency
   and allow a later retry.

Team and event identity in returned JSON must match the requested UUIDs.
Lookup manifests contain no registration or attendee data. They have public
CORS and `Cache-Control: public, max-age=0, must-revalidate`; versioned detail
JSON remains immutable. Edits update the pointer from the current event
descriptor. Archive transitions preserve the stable lookup URL; a time-only
rollover reuses the unchanged pointer and event JSON.

Pointers and targets are validated and published in the same atomic deployment.
Unpublishing/deletion removes the lookup and target from the active inventory,
including removal of a team's last public event. The data deployment contains no
HTML or catch-all rewrite, so missing lookup paths return HTTP 404, not a frontend
fallback. Consumers that encounter an older feed without `eventLookupUrlTemplate`
should report unsupported lookup until that feed has been updated.

A scope manifest contains counts, page size, page URL template, facets, search
configuration and a geographic index link. Listing pages contain at most 12
summaries, with a 180-character excerpt and `detailUrl`. Full descriptions are
only in individual event JSON. Empty upcoming scopes have zero pages and no
search index. Archive scope names are `archive/<start-year>`; events become past
at their end date, or start date when no end date is supplied. Daily
reconciliation moves events into archives.

For example, a custom UI loads an upcoming listing without any historical data:

```js
const origin = 'https://seawatch-public-data.netlify.app';
const read = async path => {
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  return response.json();
};
const team = await read(`/teams/${teamId}/manifest.json`);
const scope = await read(team.scopes.upcoming.manifest);
const page = scope.pages ? await read(scope.pageUrlTemplate.replace('{page}', '1')) : { items: [] };
```

Full-text search uses independent Pagefind bundles per team and scope, generated
directly from event records. Import `scope.search.moduleUrl` from the feed origin
and call its `search` API. Results include `meta.eventId`, `meta.teamId` and
`meta.detailUrl`; your UI defines attendee-facing routes. The index language is
`en`, matching the previous site. Archive searches load the selected year's
index; searching multiple years requires loading/merging those indexes.

Geographic indexes are fetched only for geographic searches. The first index
links coarse-cell index pages (128 leaf descriptors each). Leaf point files
contain at most 256 records, including overflow pages at maximum geohash
precision. Use bounds to select cells and verify exact distances against point
coordinates. Missing or ambiguous country/centroid matches are excluded. Postal
references are discovered by country, then by encoded two-character postal
prefix. They are shared rather than copied into every team's feed.

Stable manifests require revalidation. Content-versioned files are immutable.
All feed and search assets allow anonymous cross-origin reads. An already-open
client may reference a removed generation after publication: on 404, refresh the
stable manifest and retry using its current links. Previously downloaded public
data cannot be recalled from consumers.

## Generation and change queue

`20261105170000_public_data_publication` creates
`PublicDataPublicationState` and transactional PostgreSQL triggers. Public event
creation/edits/unpublishing/deletion, exported team metadata, event-type names,
and team deletion request publication. Non-exported event changes and attendee
registrations do not. Triggers also cover imports and cascades without separate
application hooks. Queue rows intentionally have no team foreign key, preserving
deletion tombstones. Rollback removes the request with the data change.

The worker checks the small queue every five seconds and debounces changes for
30 seconds. It snapshots requested revisions and acknowledges only those after
Netlify confirms the candidate is actually published. New changes during a build
remain pending. Errors retain requests and back off from 30 seconds to 15 minutes.
Daily/startup reconciliation refreshes geographic references and detects archive
rollover or writes outside normal change paths.

The publisher caches only public projections, content hashes and artifact
inventories. Changed teams are read in a repeatable-read, read-only transaction.
Only changed event detail files and affected upcoming/archive-year scopes are
regenerated. Other scopes and teams reuse their existing files. Team metadata
changes do not regenerate event search. A missing/incompatible cache causes a
full source reconciliation, not an empty publication.

All deployments use Netlify's digest API: the complete desired path/hash map is
sent, but only requested content hashes are uploaded. Omitting obsolete files
removes them from the new atomic deployment. A PostgreSQL advisory lock
serializes publishers using the production database. An interrupted incomplete
`public-data:` digest upload can be cancelled under that lock and retried;
published deployments and other deployment types are not cancelled. A deployment
still processing is inspected on the next attempt. Failed generation/upload
leaves the old publication intact; errors after Netlify activates a deployment
require inspecting its active state, and queue revisions remain retryable.

## Commands and cutover

Use Node 22+ and `yarn install --immutable`. Run against the **actual production
CRM database**, not a developer `.env` dataset. `PG_SSL_ROOT_CERT` is supported
for databases with a custom CA. Run the additive migration through the normal
CRM image deployment before enabling the publisher.

```sh
# Generate data and indexes locally; prints the candidate output directory.
yarn events:export
# Alias for export; no Next.js build is performed.
yarn events:build
# Export and upload a draft. Does not acknowledge production queue revisions.
yarn events:publish
# After inspecting the draft, operator-run rename and production publication.
yarn events:rename
yarn events:publish --production
```

Commands require `NETLIFY_AUTH_TOKEN` except local-only export. For an explicit
one-off operator action, `EVENTS_USE_LOCAL_NETLIFY_LOGIN=true` uses the existing
Netlify CLI login. Do not copy that personal owner credential into the publisher.
Use a dedicated automation credential in the runtime secret store. The rename
command updates the existing site, not a new site, and is never run by the worker.
The old Netlify HTML URLs are retired; the feed has no HTML fallback. `/` may
return 404; `/manifest.json` is the entry point. Do not configure
`NEXT_PUBLIC_EVENTS_BASE_URL` to this data host: it has no attendee-facing pages.
Custom event websites and their registration links are separate work.

In `datacenter-infra`, the CRM role supports:

```yaml
crm_public_data_enabled: true
crm_public_data_autostart: false # manual-only until draft/cutover review
secret_crm_public_data_netlify_token: <stored only in Ansible Vault>
```

First configure with `crm_public_data_autostart: false`, run the draft and cutover
commands with `docker compose run --rm --no-deps public-data-publisher yarn ...`,
then set `crm_public_data_autostart: true` and apply again to start automation.
See `datacenter-infra/crm.sea.watch/PUBLIC_DATA.md` for the complete sequence.

You apply `ansible-playbook crm.sea.watch/deploy.yml --limit crm.sea.watch` after
the new tools image and migration are deployed. The role adds
`public-data-publisher` with the production Compose database URL, its own Netlify
credential, and persistent `public-data-cache` volume. The normal image deployment
script subsequently updates it alongside existing workers. It receives no NATS,
SMTP or storage credentials. Enable it after the draft/rename cutover is ready.
Inspect `docker compose logs --tail=100 public-data-publisher`; repeated failures
need attention. Monitor pending revisions, attempts, last error and last
publication time in `PublicDataPublicationState`. Never clear the queue as a
retry mechanism or prune the active cache volume. Stop the service before
setting its Ansible enable flag back to false.

`PUBLIC_DATA_STATE_DIR` defaults to ignored `.public-data/` locally and is
`/var/lib/crm-public-data` in the publisher container. Candidates live in
`runs/<id>/out`; an atomic `current.json` pointer identifies the successful cache.
Draft candidates are retained for inspection; successful production publication
retires its previous local cache. Netlify deployment history provides rollback,
which can restore content since unpublished; reconcile before resuming automation.

## Registration bridge

The shared API remains `POST https://api.sea.watch/v1/events/registrations`,
accepting JSON `eventId`, `name`, `email`, optional `phone`/`notes`, and a UUID
`Idempotency-Key`. HTTP 202 means JetStream stored the request, not final CRM
acceptance. Custom UI origins must be explicitly allowed by the API; public feed
CORS does not grant registration API access. Current eligibility is validated by
the CRM consumer, including events unpublished since a client loaded its data.

The API/JetStream Argo path remains `deploy/seawatch-api/kubernetes`. The CRM
consumer connects through `wss://seawatch-api.k8s-vpn.sea.watch`, using the CRM-only
credential and durable consumer `crm-event-registrations-v1`. The Headscale ACL
must grant `tag:crm` access to `tag:kubernetes-gateway:53,443`. Consumer configuration
remains in the infrastructure CRM role. Submission UUID uniqueness prevents
redelivery duplicates. The registration and confirmation email batch commit in
one transaction; the existing background worker dispatches through the team's
Scaleway TEM integration. The registration/email flow was verified live before
this feed conversion. Feed conversion does not alter registration behavior.

## Verification

```sh
yarn test
yarn typecheck
# Explicit isolated localhost PostgreSQL database only:
PUBLIC_DATA_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:PORT/postgres \
  node --import ./tests/register-hooks.mjs --test tests/public-data-postgres.test.ts
```

Tests cover incremental reuse, private-field exclusion, empty feeds, deletion,
archive rollover, 10,000 historical events and dense geographic overflow, digest
uploads, transactional queue rollback, concurrent changes, draft isolation,
failed publication recovery and cache reconstruction. The PostgreSQL integration
test creates/drops only its own random schema and mocks all Netlify requests.
