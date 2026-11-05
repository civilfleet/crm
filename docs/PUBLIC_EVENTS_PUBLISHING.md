# Public events publication

Public pages are a separate static Next.js application in `public-events/`.
The full CRM continues to run independently. `config/public-events.json`
identifies the dedicated Netlify site and the explicit team allowlist.

## Build and publish

Use Node 22 or newer, install with `yarn install --immutable`, and configure
`DATABASE_URL` (plus `PG_SSL_ROOT_CERT` when needed). The exporter uses a
read-only repeatable-read transaction and an explicit public-field projection.
Only `isPublic` events belonging to configured teams are exported; contact
records, registrations, internal flags, and credentials are never included.

```sh
yarn events:export
yarn events:build
# Draft by default; requires NETLIFY_AUTH_TOKEN.
yarn events:publish
# Production publication, after inspecting the draft.
yarn events:publish --production
```

The combined publish command exports and builds before uploading. It uses a
PostgreSQL advisory lock to serialize publishers across hosts. Complete Netlify
deploys replace the site, including removal of unpublished and deleted pages.
Failed builds/uploads retain the last successful production deploy. Keep the
previous deployment available in Netlify for rollback; rolling it back can
restore event details that were subsequently unpublished.

An operator can explicitly set `EVENTS_USE_LOCAL_NETLIFY_LOGIN=true` for local
publication using the existing CLI login. Do not copy that personal owner token
into the CRM deployment. Automated publication needs its own deployment token,
stored in the private runtime's secret configuration. No Netlify build hook or
private CRM access from Netlify is required.

Run `yarn events:worker` as a supervised private process using the existing
`runner-tools` image. It detects database changes every five seconds, debounces
them for 30 seconds, refreshes daily in UTC, retries failures, and skips a
deployment when the published snapshot fingerprint is already current. Its
filesystem must be writable for static build output. Persist/review worker logs
and alert on repeated publication failures. Source-code changes require a worker
rollout and publication; redeploying the worker triggers a fresh check.

Configure `NEXT_PUBLIC_EVENTS_BASE_URL=https://seawatch-events.netlify.app` at
CRM build time to make staff copy the external event links. The existing CRM
pages remain in place during validation; moving the CRM behind the VPN is a
separate cutover.

## Search and archive

Listings fetch 12 summaries at a time. Past events retain their URLs and are
browsable by year. An event becomes past at `endDate`, or `startDate` if no end
is supplied. Daily publication updates listings; the form also checks the
cutoff in the browser, and the CRM validates eligibility at processing time.

Pagefind is built after the static export and loads search chunks on demand.
Results are scoped to a team and intersect text, type, region, format, and date
filters. Only the visible result summaries are fetched. Date filters use UTC
calendar dates; event detail times use the event's timezone, defaulting to
Europe/Berlin for existing records without a timezone.

Geographic shards use geohashes, split dense cells above 256 coordinate records
(up to precision 8), and separate upcoming events from archive years. Geographic index manifests
are also loaded on demand, first by archive scope and then by coarse geohash;
opening the listing never downloads the historical geographic index. Radius
search loads intersecting cells and checks spherical distances between postal
centroids. Unknown or ambiguous event countries/centroids are excluded from
radius searches. The additive migration infers a country only when a postal
code has one country in the existing catalogue; staff can correct country codes
in the event form. Postal lookups are sharded by country and the first two code
characters. The overall published catalogue may grow without entering the
initial browser payload. An already open tab whose generation has been removed
may need a refresh after publication.

## Registration intake and Kubernetes

Application directories and the separate CRM migration preparation are mapped in
[`deploy/README.md`](../deploy/README.md). The API Argo source path is
`deploy/seawatch-api/kubernetes`; the planned CRM path is `deploy/crm/kubernetes`.

The public service accepts `POST https://api.sea.watch/v1/events/registrations`.
It requires JSON with `eventId`, `name`, `email`, optional `phone` and `notes`,
plus a UUID `Idempotency-Key` header. It returns `202` only after a JetStream
storage acknowledgment. It never connects to the CRM database. Browser
submission remains disabled until `NEXT_PUBLIC_EVENTS_API_URL=https://api.sea.watch`
is set during the **static site build**; enable it only after end-to-end checks.

The API bounds payloads at 16 KiB and fields independently. CORS permits only
configured origins. A separate JetStream stream enforces ten attempts per
source address per rolling hour across API replicas; it stores salted address
hashes rather than addresses. Ingress must overwrite/append trusted forwarding
headers and NetworkPolicy must restrict direct API access to Traefik.

`deploy/seawatch-api/kubernetes/` contains the public API, single-replica persistent JetStream,
stream initialization Job, network policies, public TLS route for api.sea.watch,
and a private broker WebSocket route at
`wss://seawatch-api.k8s-vpn.sea.watch`. The private route uses `vpnwebsecure`
and the shared TLS store; the public API deliberately uses `websecure` and its
own Certificate. Confirm public DNS targets and the shared issuer before use.
Broker monitoring stays internal. This single-broker setup survives process/pod
restarts with its PVC but is unavailable during broker/node recovery; it is not
a replicated high-availability queue.

Before bootstrapping Argo CD:

1. Run the manual **Public API image** Gitea workflow. It tests the repository,
   pushes `runner-public-api`, and replaces both API/initializer placeholders
   with the returned digest. It guards against superseded builds.
2. Generate independent API, CRM, and bootstrap broker credentials. Render
   `deploy/seawatch-api/nats-authorization.conf.example`, seal it using the platform public
   certificate, and commit only the SealedSecret named `seawatch-nats-auth`
   containing `authorization.conf` in namespace `seawatch-api`.
3. Seal `seawatch-api-env` containing `API_NATS_PASSWORD`,
   `BOOTSTRAP_NATS_PASSWORD`, and a random `RATE_LIMIT_HASH_KEY`. Seal a separate
   `gitea-registry` pull secret in the same namespace. Runtime secrets and
   registry/Git credentials are independent.
4. Verify cluster prerequisites from `KUBERNETES_GITOPS_DEPLOYMENT_GUIDE.md`,
   namespace access, Ceph PVC provisioning, and DNS/TLS. Bootstrap the AppProject
   followed by the Application from `deploy/seawatch-api/argocd/`.
5. Confirm Argo `Synced/Healthy`, running image digests, streams, PVC, probes,
   network restrictions, TLS, and public intake before enabling the frontend.
   Never delete the PVC or purge a stream as a retry mechanism.

The initialization Job creates streams only if absent and does not rewrite
existing retention policies. Registration and failure streams have no time
expiry, reject new messages when their 1 GiB limits are reached, and need alerts
well before full. Establish and test JetStream backups and restore before
production acceptance; a Ceph PVC is not a backup. Alert on pending count,
oldest unprocessed submission, consumer inactivity, failure-stream messages,
disk usage, and repeated API 503 responses. Reconciliation is through the
broker's authenticated administrative tools, not a public API endpoint.

Apply the committed Prisma migration through the normal CRM migration process
before running `yarn events:consume`. Configure `NATS_URL` to the private WSS
route and `NATS_USER=crm` plus its password. The CRM runtime itself needs
tailnet DNS/network access; operator laptop connectivity does not prove that.
Supervise this process alongside the publisher and existing background worker.
The consumer uses a durable pull cursor and acknowledges only after the database
transaction commits. Submission UUID uniqueness makes redelivery idempotent.
The same transaction queues a confirmation email through the existing email
batch worker, requiring the team's enabled Scaleway TEM integration. Validate
that integration and email-worker health before enabling registration.

Unavailable/ended events and messages failing ten deliveries are copied to the
persistent failure stream before acknowledgment. They require staff review;
receiving a submission is not a promise of acceptance. Test an outage/restart,
redelivery, duplicate submission, final confirmation, and unpublishing before
cutover. No synthetic registration should be inserted into the production CRM
for infrastructure-only tests.

## Validation recorded during implementation

- All 156 repository tests passed outside the restrictive sandbox; typecheck
  and lint for changed application files passed.
- The static production build indexed four public Sea-Watch events. The source
  database currently contains historical sample/test events; no upcoming public
  Sea-Watch event was present. Another team's records were excluded.
- Desktop/mobile browser checks covered archive browsing, text search and date
  filtering without horizontal overflow.
- An isolated 10,000-event Pagefind fixture indexed in about 2.1 seconds.
  A cold broad search fetched twelve result fragments and 248,883 bytes of
  search response bodies (19 resources), rather than every event summary.
  These are local fixture measurements, not production latency guarantees.
- A disposable JetStream broker accepted ten synthetic HTTP submissions,
  rejected the eleventh with 429, retained messages across restart, and
  redelivered an unacknowledged message. The deployment credential template
  passed a restricted-producer and durable-consumer WebSocket test.
- Kubernetes deployment, production database migration, confirmation delivery,
  automated publisher supervision and private CRM network access still require
  live configuration and verification. No production CRM data was changed by
  these tests.

## Current public deployment

Published on 2026-11-04 at https://seawatch-events.netlify.app/ (site ID
`ef0bcb3b-e04c-400d-889b-028af45b349a`). Active production deployment
`6aeb47a48ac2c89adfd88446` applies the user-selected sea-watch.org identity:
official logo, locally served Inter 400/700, navy/cyan/white palette, square
controls, shared header/footer, and consistent listing/detail styling. The design
is documented in `public-events/DESIGN.md` and its app-scoped Impeccable sidecar.
The preceding deployment `6aeaeb530f07fb64eb93457b` remains the rollback reference.

This publication uploaded the tested static output without re-exporting or
changing event data, enabling registration, or altering the private CRM. The
homepage opens the configured team's listing directly. Upcoming/archive controls,
text search and date/geographic filtering remain available; search filters update
after a 300 ms debounce. The four existing public events are historical.

Netlify's published deployment pointer was verified against the new ID. Public
HTTPS checks returned 200 for the homepage, team listing, detail page, logo and
Pagefind script. Live desktop browsing showed all four events without horizontal
overflow or browser console errors. Registration intake and automatic publishing
remain disabled pending live infrastructure configuration.
