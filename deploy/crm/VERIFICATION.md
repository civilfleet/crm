# Preparation checks — 2026-11-04

These results concern repository changes and disposable local containers only.
No production deployment, backup, data import, DNS/ACL change, commit or push was
performed during preparation.

Passed:

- `yarn typecheck`.
- `yarn test`: 153 passed, zero failed (outside sandbox; the restricted run could
  not complete the subprocess-based vCard test).
- Changed TypeScript files: Biome check passed.
- Python deployment helper tests: five passed, covering immutable image updates,
  source key preservation and rejection of ambiguous/conflicting inputs.
- Offline manifest validator: 23 resources. `kubectl kustomize` rendered them.
- Gitea workflow YAML parsed and all shell steps passed `bash -n`.
- Both Kubernetes Docker targets built. The app ran as `node`, bound to `::`,
  and returned HTTP 200 from `/api/health/live` and `/api/health` against the
  disposable database.
- All 29 committed Prisma migrations applied to fresh PostgreSQL 16/PostGIS.
  Local logical dump/restore into a separate database preserved migration history.
- Non-root, read-only-root SeaweedFS started with persistent-directory layout
  backed by disposable tmpfs for this test. The storage initializer created the
  bucket and applied CORS; an authenticated S3 object write/read matched content.
  This does not test persistence across restart or Ceph ownership.

The `--ready` validator deliberately fails: application/tool image placeholders
and five missing sealed credentials require source inventory and registry builds.
Live SSH authentication to `crm.sea.watch` and `kube01.sea.watch` was unavailable.
Production database identity, data/history reconciliation, source storage version,
real restore timing, capacity, backups, certificate issuance, DNS, access policy,
external callbacks and end-to-end acceptance remain pending per the runbook.

## Integration checks — 2026-11-05

The saved CRM preparation was integrated into the current API bridge checkout.
Both application trees are present: `deploy/crm` and `deploy/seawatch-api`.
The original stash and a separate pre-integration backup were retained.

Passed after integration:

- `yarn typecheck`; all 158 application tests; changed TypeScript Biome checks.
- Five Python deployment-helper tests and the 23-resource offline validator.
- Offline `kubectl kustomize deploy/crm/kubernetes` rendering.
- All three deployment workflows parsed; their shell steps passed `bash -n`.
- Dry runs of the actual CRM build step confirmed default VM targets, manual
  Kubernetes rehearsal targets, separate Kubernetes tags and opt-in GitOps.
- The public API and non-root Kubernetes tools Docker targets built locally.
  The API image runs its bundled executable as UID 1000 with no source `.env`.
- API resource files, including sealed ciphertext, and local credential files
  matched their pre-integration hashes. Application source paths remain separate.
- CRM automated sync is absent, web/worker replicas remain zero, and reminders
  remain suspended. Manual and automatic VM deployment guards agree.

The readiness gate still deliberately fails for the missing CRM sealed secrets
and application/tool image digests. No cluster resources, source production data,
DNS, repository variables or running services were changed. These checks do not
replace the restore rehearsal and live acceptance requirements in README.md.
