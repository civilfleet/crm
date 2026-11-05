# Application deployments

Each application owns a separate Argo CD application, namespace, manifests and
bootstrap resources. Use the exact application-specific manifest path below.

| Application | Argo source path | Bootstrap manifests | Namespace | Status |
| --- | --- | --- | --- | --- |
| Public API bridge and NATS JetStream | `deploy/seawatch-api/kubernetes` | `deploy/seawatch-api/argocd` | `seawatch-api` | Prepared; requires image digest publication and cluster verification |
| Private CRM, worker, PostgreSQL and upload storage | `deploy/crm/kubernetes` | `deploy/crm/argocd` | `crm` | Preparation included; manual sync, web/worker at zero, reminders suspended |

The CRM preparation was restored from branch `dev-kubernetes-migration`'s saved
work and integrated alongside the API bridge. Its original stash is retained as
a recovery copy. See [`crm/README.md`](crm/README.md) for rehearsal, credential,
backup and cutover requirements. `deploy/crm/operations` contains manual restore
and migration jobs outside Argo's normal resource path.

Adding these files does not switch the running CRM to Kubernetes. Its Application
starts with manual sync, web/worker replicas at zero and reminders suspended.
`CRM_DEPLOY_TARGET` remains `vm` by default; switching it to `kubernetes` is a
separate cutover decision. Main-branch pushes still trigger the existing VM CI
workflow while that default is retained.

The paths in `KUBERNETES_GITOPS_DEPLOYMENT_GUIDE.md` are generic examples. In this
repository, substitute the application-specific paths above. Do not point an
Argo Application at the entire `deploy` directory or at `deploy/seawatch-api`:
those parents include bootstrap resources and can span multiple applications.

## Public API bridge

The bridge serves public registration intake at `api.sea.watch`. NATS JetStream
has its own persistent storage in namespace `seawatch-api` and exposes the CRM
consumer's WebSocket connection through the private VPN gateway. It does not
run the CRM or its database. See
[`docs/PUBLIC_EVENTS_PUBLISHING.md`](../docs/PUBLIC_EVENTS_PUBLISHING.md) for the
credential, image, DNS, backup and end-to-end registration prerequisites.

After publishing the manifests and replacing image placeholders, bootstrap the
project followed by the Application from a workstation with cluster access:

```sh
kubectl apply -f deploy/seawatch-api/argocd/app-project.yaml
kubectl apply -f deploy/seawatch-api/argocd/application.yaml
```

The API Application enables automated sync. Its source path is
`deploy/seawatch-api/kubernetes`, revision `main`, cluster `in-cluster`.

## Existing Argo Application using the previous path

If you already created `seawatch-api` with source path `deploy/kubernetes`,
update that same Application to `deploy/seawatch-api/kubernetes` after this
layout change reaches its tracked revision. Reapply the Application manifest
above or edit its Path in Argo CD. Do not create a second application or delete
the existing namespace, PVC, or broker to change the path.

Kubernetes resource names, namespaces and sealed credential contents are
unchanged by the move. Once the same Application reads the new path, it manages
the same resources. The old parent directories are intentionally removed so the
future CRM deployment cannot be picked up by the API Application accidentally.
