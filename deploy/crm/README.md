# CRM Kubernetes migration

Originally prepared on `dev-kubernetes-migration` and integrated alongside the
API bridge preparation. This directory moves web,
worker, PostgreSQL 16 and SeaweedFS to namespace `crm`, retaining
`crm.vpn.sea.watch` and `crm-s3.vpn.sea.watch`. Production has not been changed.
The public API and NATS resources are isolated under `deploy/seawatch-api/`;
its Argo Application and credentials are independent of this deployment.

## Deployment contract

- Argo CD reads `deploy/crm/kubernetes` on main. Initial sync is manual.
- Web and worker start at zero replicas; reminders are suspended. PostgreSQL and
  storage start with retained Ceph RBD claims (20 GiB and 100 GiB). Measure source
  usage and growth before approving these sizes. Single replicas are not HA.
- Both routes use the existing private `vpnwebsecure` entrypoint. A namespace
  Certificate covers the retained `.vpn.sea.watch` names using the existing
  `letsencrypt-production` ClusterIssuer; the platform wildcard for
  `.k8s-vpn.sea.watch` does not cover these names.
- No shared controller, DNS, Headscale or cluster issuer is installed here.
- Database migration and storage initialization Jobs are manual operations,
  outside the Argo resource path. They are not startup hooks.
- Secrets are absent and application images have explicit bootstrap placeholders.
  Do not sync until the readiness checks below pass.

## 1. Inventory and access

Read the repository's `KUBERNETES_GITOPS_DEPLOYMENT_GUIDE.md` and obtain working
operator access to `kube01.sea.watch` and `crm.sea.watch`. Preparation could not
inspect either host: the SSH agent had no identities and authentication failed.
Source infrastructure templates describe `/opt/crm`, Compose app/worker,
`crm-postgres` (PostgreSQL 16), and SeaweedFS. Confirm these against running
containers before using any command below. The checkout's `.env` is not the
production source of truth.

Record running image digests, actual database host/name/user/version, extensions,
DB and object sizes, bucket versioning, SMTP and inbound email settings, schedulers,
source code revision and `_prisma_migrations` names/checksums/failures. Verify
credentials and encrypted integration data can be decrypted with preserved keys.
Do not print secret-bearing Docker inspection or environment output to logs.

Inventory external dependencies before cutover: public events, external funding
or signature links, OIDC callbacks and `/api/webhooks/scaleway-email`. External
webhooks cannot reach a private-only route. The separate public bridge must be
reviewed and deployed where required before removing access these flows need.

The checked-in infrastructure defines the storage DNS record against the VM,
while the CRM name may be the VM's Headscale MagicDNS identity. Have the platform
operator confirm both resolutions, arrange an explicit gateway record for each,
and resolve any MagicDNS collision (retain the old VM under a rollback name).
Preserve administrative access to the old VM. Review `group:crm-users` versus
`group:kubernetes-gateway-users`: access to a shared gateway is a different
network policy from access to the dedicated VM. DNS names do not preserve ACLs.
Application RBAC remains a separate requirement. No DNS/ACL changes are made here.

## 2. Seal runtime credentials and build images

Install PyYAML using `deploy/crm/requirements.txt`; install kubeseal and obtain the
cluster's public sealing certificate through the documented platform process.
Use the actual running app/worker containers (identified by Compose labels).
Once names and environment have been confirmed, stream `docker inspect` JSON
through SSH into the local sealing script; do not save plaintext inspection:

```sh
# Export CRM_REGISTRY_USERNAME and CRM_REGISTRY_TOKEN securely first.
# Substitute confirmed container names and certificate path.
ssh crm.sea.watch 'sudo -n docker inspect CONFIRMED_APP CONFIRMED_WORKER' \
  | python3 deploy/crm/scripts/seal-runtime.py --cert /secure/sealed-secrets.pem
```

The script requires both source roles, rejects conflicting shared settings and
unexpected database identity, and writes five strict namespace/name SealedSecrets.
It preserves AUTH_SECRET, integration encryption keys and the effective inbound
email encryption key (including its AUTH_SECRET fallback). Registry pull access
is supplied separately. `--extra-env /secure/approved-missing-values.json` permits
missing approved settings, never conflicting replacements. Protect this file;
remove it according to your secret-handling policy. Missing CRON or integration
settings require an explicit inventory decision; do not invent encryption keys
for existing encrypted records. Check the whitelist against the live deployment
and extend it if additional providers are enabled before sealing.

After review and authorized merge, dispatch `docker-image.yml` on main with
`runtime_target=kubernetes`. Keep repository `CRM_DEPLOY_TARGET` unset or `vm`
during rehearsal so normal pushes still deploy the VM. A manual Kubernetes build
publishes non-root image variants under separate `-kubernetes` tags and commits their immutable digests to the app,
worker, reminder and manual-operation manifests. The workflow does not sync Argo.
Never deploy the Kubernetes non-root variant to the VM by selecting its tag there.
The workflow requires registry credentials and Git write access already used by
CI; those credentials have not been verified in this preparation.

```sh
python3 -m unittest discover -s deploy/crm/scripts -p 'test_*.py'
python3 deploy/crm/scripts/validate.py --ready
kubectl kustomize deploy/crm/kubernetes > /tmp/crm-rendered.yaml
```

The readiness validator checks structure, digests and presence of encrypted keys;
it cannot prove decryption, valid credentials, available capacity or live health.
Review all resulting changes. Have an authorized operator install the AppProject
and Application in `deploy/crm/argocd`, then manually sync. Confirm SealedSecret
status, image pulls, certificate issuance, both PVCs Bound and stateful pod health.
Keep web/worker at zero and reminders suspended throughout restore rehearsal.

## 3. Rehearse restore before scheduling downtime

Use a restricted backup location (umask 077), encryption at rest and off-VM
copies. Confirm the source DB identity first. For the template-defined instance:

```sh
umask 077
ssh crm.sea.watch 'sudo -n docker exec crm-postgres pg_dump -U crm -d crm -Fc' > crm.dump
ssh crm.sea.watch 'sudo -n docker exec crm-postgres pg_dumpall -U crm --globals-only' > globals.sql
sha256sum crm.dump globals.sql > SHA256SUMS
```

Global backups contain role credential material; never commit them. Check command
exit status and `pg_restore --list crm.dump`; a file alone does not prove success.
Restore into a separate target database `crm_rehearsal`, keeping target `crm` empty
for final restore. Use `pg_restore --exit-on-error --single-transaction --no-owner
--no-privileges` with the explicitly selected rehearsal database and role. Do not
blindly restore global roles over platform accounts. Retain PostgreSQL major 16;
restore required extensions at compatible versions. The candidate PostGIS image
supports the application's geography queries; confirm source extension versions
and behavior. No major-version data-directory reuse is supported.

Compare schema and exact per-table counts, key relationships, encrypted settings,
representative contacts/events/files and migration history. Reconcile any existing
schema/history drift on the clone before applying pending migrations. Do not
remove historical rows, replay the baseline over existing tables, or run migrations
against the source as part of this exercise. Apply the manual migration Job only
to the final restored target after the same procedure succeeds on the clone.
The migration Job points at database `crm`, not `crm_rehearsal`; explicitly select
the clone in your rehearsal environment. Workers, SMTP sending and scheduled jobs
must remain disabled while experimenting with copied production data.

For uploads, prefer logical S3 transfer with two explicitly configured rclone
remotes, `vm` and `k8s`, rather than copying SeaweedFS's raw files between versions.
Supply credentials securely; never embed secrets in shell arguments or Git.
Use a separate `crm-rehearsal` target bucket for rehearsal. Then, for example:

```sh
rclone copy vm:crm k8s:crm-rehearsal --metadata
rclone check vm:crm k8s:crm-rehearsal --download
```

Check both commands' status, object counts, sizes, metadata/content types and
representative application downloads. `check --download` reads object content
rather than assuming multipart ETags are hashes (see [rclone check](https://rclone.org/commands/rclone_check/)).
This is a current-object transfer, not a complete version-history backup. If
versioning or delete markers exist, define and rehearse their preservation first.
Do not use `sync` or delete existing destination objects as routine preparation.
Retain the original SeaweedFS data and a consistent offline backup for recovery.
The candidate storage image is pinned; confirm compatibility with the actual
source version. Benchmark the complete transfer and verification to estimate the
maintenance window; no downtime duration is promised before this measurement.

## 4. Freeze, final backups and cutover

Proceed only after rehearsal, external-caller routing, access controls and backup
recovery have been accepted by the operator responsible for production.

1. Establish and test recurring off-cluster database and object backups. Ceph PVC
   retention is not a backup. Retain source VM volumes and configuration.
2. Stop the source web, worker and reminder scheduler. Block source browser S3
   writes too, including outstanding presigned PUT URLs; leave a controlled read
   path for transfer. Inventory and stop other integrations that can write data.
3. With all source writes frozen, take final database and storage backups. Copy
   to off-VM storage and verify checksums/restoreability. Keep the freeze in place
   until validation and cutover finish so database references and files agree.
4. Restore the final DB into empty `crm`. Apply only rehearsed pending migrations
   using `operations/migrate.yaml`, inspect Job logs/status and compare counts.
   Run `operations/storage-bootstrap.yaml` explicitly to create target `crm` and
   apply its CORS policy. Copy current objects into this fresh bucket and perform
   full content verification. Confirm old URLs/keys resolve without rewriting DB
   records. If either target already contains live data, stop for reconciliation.
5. Manually verify stateful readiness and image/secrets/certificate status. In Git,
   set web/worker replicas to one and sync only after confirming source worker is
   stopped. Keep reminders suspended until the old scheduler is confirmed off.
   Set repository `CRM_DEPLOY_TARGET=kubernetes` before normal main pushes resume;
   this disables both automated and manual VM deployment jobs.
6. Have the platform operator apply the reviewed Headscale/DNS changes to point
   both retained names at the existing private Kubernetes gateway. Verify actual
   DNS, TLS names and routing from an authorized VPN client. Check an unauthorized
   VPN identity and the public gateway cannot access either service.
7. Verify login/SSO and magic links, team authorization, contact/event reads,
   browser upload including CORS and presigned signature, download, queue handling,
   inbound mail routing, and worker heartbeat for the actual pod ID. Check that
   no duplicate emails occur. Readiness must fail on DB failure while liveness
   remains healthy. Then unsuspend reminders (23:00 UTC) in Git and sync.
8. Confirm Argo Synced/Healthy, PVC/secrets/cert status, logs and real backup
   recovery before retiring anything. Keep the old VM and backups for the agreed
   recovery period; do not prune retained claims.

Before target writes begin, rollback can restore DNS and start the unchanged VM
services with its matching image versions. After writes on the target, reverting
DNS loses those writes unless database and objects are reconciled back together.
That rollback is a separate data migration, not a lossless toggle. Record the
last safe rollback point and who controls the write freeze.

## Local verification scope

Offline validation and disposable Docker tests cannot establish cluster capacity,
Ceph permissions, IPv6 networking, source data correctness, DNS, certificate
issuance, external email delivery or real access policy. See [VERIFICATION.md](VERIFICATION.md) for preparation results. Record production
acceptance separately from these local checks.
