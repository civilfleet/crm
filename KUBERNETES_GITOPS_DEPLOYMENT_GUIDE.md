# Deploying an application to the Sea-Watch Kubernetes cluster

This runbook explains how to deploy an application from its own repository to
the Sea-Watch Kubernetes cluster, using private HTTPS below
`*.k8s-vpn.sea.watch`. It is intended to be copied into another application
repository so that an agent can prepare the deployment without depending on
the infrastructure repository at runtime. Container, CI, storage, and bootstrap
examples originate from the Justice Fleet Strapi CMS; adapt those parts to the
actual application rather than adding Strapi or PostgreSQL unnecessarily.

The application repository should own its Dockerfile, CI workflow, Kubernetes
manifests, and Argo CD bootstrap manifests. Cluster-wide services remain
platform prerequisites managed elsewhere.

The default audience is `group:kubernetes-gateway-users` on our Headscale
tailnet. Public ingress is a separate, explicit deployment choice. Existing
public Justice Fleet deployments do not need to be migrated to use this guide.

## Architecture

The deployment flow is:

```text
push application change to Gitea main
        |
        v
Gitea Action builds and pushes an image tagged with the source commit
        |
        v
workflow records the immutable image digest in the Kubernetes Deployment
        |
        v
workflow commits that manifest change back to main with [skip ci]
        |
        v
Argo CD detects the Git change and synchronizes the cluster
        |
        v
Kubernetes rolls out the exact image digest
```

Git credentials, registry credentials, and runtime application secrets are
three separate credential sets:

- Argo CD repository credentials let Argo CD read Git manifests.
- Gitea Actions registry credentials let CI push container images.
- A Kubernetes `imagePullSecret` lets cluster nodes pull private images.

One credential never implicitly provides either of the other capabilities.

## Known platform prerequisites

Verify these before adding application manifests:

- Argo CD is installed and can deploy to the `in-cluster` destination.
- Gitea is available at `git.sea.watch` and its container registry is enabled.
- At least one Gitea Actions runner has the label `docker-build` and access to
  a Docker daemon.
- Traefik is the ingress controller and provides the
  `traefik.io/v1alpha1` `IngressRoute` CRD.
- Private application HTTPS uses only the `vpnwebsecure` entrypoint, exposed
  through the internal `traefik-tailnet` Service on port 443 (pod port 9443).
- Headscale split DNS delegates `k8s-vpn.sea.watch` to CoreDNS on the shared
  gateway at `100.110.0.90`. A hostname such as `<application>.k8s-vpn.sea.watch`
  resolves to that address for clients accepting Tailscale DNS settings.
- Headscale ACLs permit the intended users to reach the gateway on TCP/UDP
  port 53 and TCP ports 80/443.
- cert-manager provides the `letsencrypt-production` `ClusterIssuer` and has
  issued the shared `*.k8s-vpn.sea.watch` certificate. Traefik loads it through
  the `default` TLSStore in the `traefik` namespace.
- the Bitnami Sealed Secrets controller is installed.
- the `ceph-rbd` StorageClass exists for persistent application data.
- Network policies are supported by the cluster CNI.

Do not add cert-manager, Sealed Secrets, Traefik, Ceph CSI, or other shared
controllers to the application repository. Treat them as platform
prerequisites and report a missing prerequisite explicitly.

No per-application public DNS record, Headscale DNS record, Headscale restart,
Tailscale sidecar, Certificate, TLSStore, or copied TLS Secret is needed. Use a
single hostname label below `k8s-vpn.sea.watch`; the shared wildcard certificate
does not cover nested names such as `api.<application>.k8s-vpn.sea.watch`.
ExternalDNS excludes this private zone. A DNS answer alone does not prove that
an application route exists: the gateway returns wildcard answers for unused
names too.

Headscale distributes DNS configuration; DNS queries for this zone travel over
Tailscale to the gateway. Ordinary internet DNS stays with the client's usual
resolvers under the platform's `override_local_dns: false` setting. A client
must have "Use Tailscale DNS" enabled (`accept-dns=true`).

All members of `group:kubernetes-gateway-users` share network access to these
applications. The gateway does not pass the original Headscale user identity
to the application. Retain application login and authorization for sensitive
or administrative functions; set OIDC callbacks, trusted origins, and the
application's external URL to `https://<application>.k8s-vpn.sea.watch`.

On a Kubernetes host in this environment, commands use:

```sh
/opt/k3s kubectl ...
```

From a workstation with a configured kubeconfig, use ordinary `kubectl`.
An authenticated Keycloak account still needs Kubernetes RBAC permissions;
the cluster-admin binding uses `keycloak-groups:cluster-admin`. Argo CD access
and Kubernetes CLI access are separate permissions. For an authorized operator
using node-local admin access, the existing SSH path is `kube01.sea.watch` and
the command is `sudo /opt/k3s kubectl ...`; do not copy admin credentials into
the application repository.

## Repository layout

A self-contained application repository should normally contain:

```text
.
|-- .gitea/workflows/image.yaml
|-- Dockerfile                         # or app/Dockerfile
|-- deploy
|   |-- argocd
|   |   |-- app-project.yaml
|   |   `-- application.yaml
|   `-- kubernetes
|       |-- namespace.yaml
|       |-- deployment.yaml
|       |-- service.yaml
|       |-- ingressroute.yaml
|       |-- network-policy.yaml
|       |-- sealed-secret.yaml
|       |-- registry-sealed-secret.yaml
|       `-- pvc.yaml                  # when persistent data is required
`-- ...
```

Argo CD should read `deploy/kubernetes` directly from the application
repository. The application must not require an entry in `datacenter-infra`.

## 1. Prepare the application container

The image should:

- run as a non-root user;
- expose one documented application port;
- write persistent files only to explicitly mounted paths;
- respond on a lightweight health endpoint;
- handle termination signals cleanly;
- be buildable without production secrets;
- pin the runtime major version and commit its dependency lockfile.

This cluster uses IPv6-addressed pods. A server bound only to `0.0.0.0` may
start successfully but reject an IPv6 Kubernetes probe. For Strapi/Node, use:

```yaml
env:
  - name: HOST
    value: "::"
```

This binds the application on the pod's dual-stack network. A startup-probe
error such as `Get http://[IPv6]:1337/...: connect: connection refused` while
the application logs claim it started is a strong sign that it is bound only
to IPv4.

Use immutable image digests in production manifests:

```yaml
image: git.sea.watch/<owner>/<image>@sha256:<digest>
```

Tags are useful as CI inputs, but the deployed manifest should contain the
digest returned by the registry push.

## 2. Configure Gitea Actions

Create a Gitea personal access token that can push packages. Add these as
repository Actions secrets under **Settings -> Actions -> Secrets**:

- `REGISTRY_USERNAME`
- `REGISTRY_TOKEN`

Do not assume the automatic Gitea Actions token can log in to the container
registry. In the tested Gitea configuration it could write repository content
but registry authentication returned `401 Unauthorized`, so a dedicated PAT
was required.

The workflow needs:

```yaml
permissions:
  contents: write
  packages: write

jobs:
  build:
    runs-on: docker-build
```

The repository's Actions token policy and branch protection must allow the
workflow to push its digest-only manifest commit back to `main`.

The essential build steps are:

```yaml
- uses: actions/checkout@v4

- uses: docker/setup-buildx-action@v3

- uses: docker/login-action@v3
  if: gitea.event_name != 'pull_request'
  with:
    registry: git.sea.watch
    username: ${{ secrets.REGISTRY_USERNAME }}
    password: ${{ secrets.REGISTRY_TOKEN }}

- id: image
  uses: docker/build-push-action@v6
  with:
    context: .
    file: Dockerfile
    push: ${{ gitea.event_name != 'pull_request' }}
    tags: git.sea.watch/<owner>/<image>:${{ gitea.sha }}
```

Pass `gitea.sha` into a shell step through an environment variable. Do not
expect an unconfigured shell variable named `GITEA_SHA` to exist:

```yaml
env:
  SOURCE_COMMIT: ${{ gitea.sha }}
  IMAGE_DIGEST: ${{ steps.image.outputs.digest }}
```

Before committing a digest, fetch `origin/main` and verify that no newer
application change has superseded the build. This prevents an older, slower CI
job from replacing the digest produced by a newer job.

When changing the Deployment, target the application container specifically.
Never run a replacement against every `image:` line. A Deployment can contain
init containers, sidecars, or migration images that must remain different.
For example:

```sh
sed -i -E \
  "/^[[:space:]]*- name: app$/,/^[[:space:]]*imagePullPolicy:/ {\
    s|^([[:space:]]*image:).*|\1 ${IMAGE_NAME}@${IMAGE_DIGEST}|\
  }" \
  deploy/kubernetes/deployment.yaml
```

Replace `app` with the exact primary container name. Commit the result with a
message containing `[skip ci]` to avoid a build loop:

```text
Deploy application <source-commit> [skip ci]
```

Run the workflow successfully at least once before expecting Argo CD to deploy
the application.

## 3. Create Kubernetes manifests

Use a dedicated namespace and consistent labels:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: <namespace>
  labels:
    app.kubernetes.io/part-of: <application>
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

Recommended pod security defaults include:

```yaml
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: <image-user-id>
    runAsGroup: <image-group-id>
    fsGroup: <shared-volume-group-id>
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

Add startup, readiness, and liveness probes. Startup probes should permit a
slow first boot or database migration without causing a premature restart.

For a single-writer PVC, use `strategy.type: Recreate` or otherwise ensure two
replicas are never expected to mount the same `ReadWriteOnce` volume
simultaneously.

Create a ClusterIP Service whose named port targets the actual application
container port. For example:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: <service>
  namespace: <namespace>
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: <application>
  ports:
    - name: http
      port: 80
      targetPort: http
```

The Deployment must use the same label and define a container port named
`http`. Then create `deploy/kubernetes/ingressroute.yaml`:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: <application>
  namespace: <namespace>
spec:
  entryPoints:
    - vpnwebsecure
  routes:
    - kind: Rule
      match: Host(`<application>.k8s-vpn.sea.watch`)
      services:
        - name: <service>
          port: http
  tls: {}
```

`tls: {}` enables TLS with the certificate selected from Traefik's shared
store. Do not specify a `secretName` from the `traefik` namespace: TLS Secret
references on an IngressRoute are namespace-local. Do not create an ordinary
Kubernetes Ingress, use public `web`/`websecure` entrypoints, add a public
LoadBalancer or NodePort, or use the unrelated `k8s-network` parent for this
private zone. Admission policies reject incompatible routes. Use an exact
`Host` matcher rather than `HostRegexp`.

This template serves HTTPS only. If HTTP-to-HTTPS redirection is required, add
a separate IngressRoute on `vpnweb` with the same Host matcher and backend,
without a `tls` field; the platform supplies the redirect middleware on that
entrypoint. Do not put a TLS-enabled router on the plain HTTP entrypoint.

Create a NetworkPolicy allowing Traefik to reach the application container
port, for example (replace `3000` with the actual pod port):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-traefik
  namespace: <namespace>
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: <application>
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: traefik
          podSelector:
            matchLabels:
              app.kubernetes.io/name: traefik
      ports:
        - protocol: TCP
          port: 3000
```

If the application owns PostgreSQL, a separate policy should allow port 5432
only from application pods. Review other policies in the namespace: allows are
additive, so an existing broad policy can still permit additional sources.

## 4. Persistent storage and PostgreSQL

For RBD-backed storage:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: <application>-data
  namespace: <namespace>
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ceph-rbd
  resources:
    requests:
      storage: 20Gi
```

For a locally hosted Strapi deployment, use separate volumes for PostgreSQL
and `/app/public/uploads`. The working Justice Fleet sizes are 10 GiB for
PostgreSQL and 20 GiB for uploads. It uses normal filesystem storage, not S3.

Pin the PostgreSQL image to a digest. Put `PGDATA` in a subdirectory of the
mounted volume, for example `/var/lib/postgresql/data/pgdata`.

Persistent storage is not a backup. Before production use, define and test
database and upload backups. Deleting an RBD PVC whose reclaim policy is
`Delete` can permanently delete the corresponding data.

### Cluster-specific Ceph CSI requirement

The Kubernetes nodes can reach Ceph monitors on `10.13.14.0/24`, but ordinary
pod networking cannot. The Ceph CSI node plugin already uses host networking;
the provisioner must also use it. In the shared Ceph chart values, the verified
configuration is:

```yaml
provisioner:
  enableHostNetwork: true
  httpMetrics:
    containerPort: 8081
```

Port 8081 matters: the node plugin already occupies host port 8080. Enabling
host networking without moving the provisioner metrics port causes pods to stay
Pending with `didn't have free ports for the requested pod ports`.

This is a shared cluster change and does not belong in the application
repository. Verify the currently deployed Ceph chart and values before making
or recommending the change.

If PVC creation remains Pending:

```sh
/opt/k3s kubectl get pvc -A
/opt/k3s kubectl -n <namespace> describe pvc <claim>
/opt/k3s kubectl -n ceph-csi-rbd get pods -o wide
/opt/k3s kubectl get storageclass ceph-rbd -o yaml
```

When the CSI log says `rados: ret=-110, Connection timed out`, test monitor
ports from both the node and the CSI provisioner pod. Node success plus pod
failure indicates a network-path problem, not a namespace problem or
necessarily invalid Ceph credentials. Once connectivity is repaired, CSI will
retry Pending claims; do not delete them merely to trigger another attempt.

## 5. Create and seal secrets offline

Never commit plaintext production secrets. The cluster's Sealed Secrets public
certificate is available from the infrastructure repository at:

```text
datacenter-infra/kubernetes/sealed-secrets.pem
```

Only the public certificate is needed to encrypt a Secret, so generation can
happen offline without cluster credentials. Install `kubectl` and `kubeseal`
locally, or use trusted container images for those tools.

Generate the ordinary Secret locally and pipe it into `kubeseal`:

```sh
kubectl -n <namespace> create secret generic <application>-env \
  --from-literal=DATABASE_PASSWORD='<generated-password>' \
  --from-literal=APP_KEYS='<generated-value>' \
  --from-literal=API_TOKEN_SALT='<generated-value>' \
  --from-literal=ADMIN_JWT_SECRET='<generated-value>' \
  --from-literal=TRANSFER_TOKEN_SALT='<generated-value>' \
  --from-literal=JWT_SECRET='<generated-value>' \
  --from-literal=ENCRYPTION_KEY='<generated-value>' \
  --dry-run=client \
  -o yaml \
| kubeseal \
    --cert=/path/to/datacenter-infra/kubernetes/sealed-secrets.pem \
    --format=yaml \
> deploy/kubernetes/sealed-secret.yaml
```

Generate the private Gitea registry pull Secret separately:

```sh
kubectl -n <namespace> create secret docker-registry gitea-registry \
  --docker-server=git.sea.watch \
  --docker-username='<registry-user>' \
  --docker-password='<read-package-token>' \
  --dry-run=client \
  -o yaml \
| kubeseal \
    --cert=/path/to/datacenter-infra/kubernetes/sealed-secrets.pem \
    --format=yaml \
> deploy/kubernetes/registry-sealed-secret.yaml
```

Reference it in the pod:

```yaml
spec:
  imagePullSecrets:
    - name: gitea-registry
```

Sealed Secrets are normally scoped to the encrypted Secret's name and
namespace. Decide the final name and namespace before sealing. The encrypted
manifest is safe to commit; the plaintext Secret and token are not.

## 6. Give Argo CD repository access

For a private Gitea repository, create a dedicated read-only SSH key pair.
Add the public key as a Gitea deploy key and give the private key to Argo CD's
repository credential configuration.

In the Argo CD UI, select an SSH repository connection and use a URL such as:

```text
gitea@git.sea.watch:<organization>/<repository>.git
```

Do not enter the SCP-style SSH URL into an HTTPS credential form. Errors such
as `invalid pkt-len found` usually mean Argo CD tried the wrong Git transport.

An SSH fingerprint such as `SHA256:...` identifies a key; it is not the public
key. Given the private key file, derive its public key with:

```sh
ssh-keygen -y -f /path/to/private-key
```

Gitea can display a public deploy key already attached to a repository, but it
cannot recover the corresponding private key. When the private key is missing,
create a new key pair instead of attempting to reconstruct it.

## 7. Define the Argo CD project and application

Keep these resources in `deploy/argocd`, but bootstrap them once through the
Argo CD UI or with `kubectl`.

Example AppProject:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: <project>
  namespace: argocd
spec:
  sourceRepos:
    - gitea@git.sea.watch:<organization>/<repository>.git
  destinations:
    - name: in-cluster
      namespace: <namespace>
  clusterResourceWhitelist:
    - group: ""
      kind: Namespace
```

The `Namespace` whitelist is required when the application directory contains
a Namespace resource. Without it, Argo CD reports `resource :Namespace is not
permitted in project`.

Example Application:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <application>
  namespace: argocd
spec:
  project: <project>
  destination:
    name: in-cluster
    namespace: <namespace>
  source:
    repoURL: gitea@git.sea.watch:<organization>/<repository>.git
    targetRevision: main
    path: deploy/kubernetes
    directory:
      recurse: true
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
```

The Application destination and AppProject destination must match. If the UI
stores `server: https://kubernetes.default.svc` instead of `name: in-cluster`,
allow that exact server form in the AppProject as well. A mismatch produces:

```text
application destination ... does not match any allowed destinations
```

Bootstrap the AppProject before the Application. These two resources live
outside the application's managed `deploy/kubernetes` directory to avoid
letting a namespaced application manage its own project permissions. If a
namespace resource whitelist is configured, it must allow at least the app's
Deployment, Service, IngressRoute (`traefik.io`), NetworkPolicy, SealedSecret,
and any required PVC, Job, StatefulSet, or ConfigMap. Do not grant permission
to install cluster-wide controllers or admission policies for an ordinary app.

## 8. Optional one-time database and media bootstrap

Do not make destructive database imports part of every deployment. For a
one-time migration, an idempotent init container is more reproducible than
manually running commands on a Kubernetes host.

A safe bootstrap image should:

1. contain the validated SQL dump and matching uploads archive;
2. wait for PostgreSQL readiness;
3. verify both archives before changing anything;
4. restore the database with `ON_ERROR_STOP` and preferably one transaction;
5. extract uploads through a staging directory;
6. validate expected table and file counts;
7. write a durable completion marker into the restored database;
8. exit immediately on subsequent pod starts when that marker exists.

Use a unique bootstrap ID for each migration, for example
`source-system-2026-10-01`. Store the completion marker in PostgreSQL, not in an
ephemeral filesystem.

When copying into an fsGroup-managed PVC, avoid `cp -a` against the volume root:
an unprivileged container may be able to write files but cannot preserve root
directory timestamps. Use `cp -R staging/. /uploads/` and extract tar archives
with `--no-same-owner`.

Bootstrap images are separate from application images. CI must update only the
main application container image. Accidentally assigning the application image
to the bootstrap init container produces a restart loop because the image does
not contain the bootstrap entrypoint.

Inspect a failing init container with:

```sh
/opt/k3s kubectl -n <namespace> get pod
/opt/k3s kubectl -n <namespace> logs <pod> -c <init-container>
/opt/k3s kubectl -n <namespace> logs <pod> -c <init-container> --previous
```

Before importing any backup, inspect it. A valid media archive without the
matching Strapi database records is insufficient, and a tiny SQL archive may
contain only dump headers with no schema or data.

## 9. Deployment and verification

After pushing the initial repository state:

1. confirm the Gitea Action built and pushed the image;
2. confirm it added a `Deploy application ... [skip ci]` commit containing an
   immutable digest;
3. refresh Argo CD and ensure the Application is `Synced` and `Healthy`;
4. verify PVCs, pods, services, the IngressRoute, private DNS, and TLS;
5. compare the desired image digest with the image actually running.

Useful commands:

```sh
/opt/k3s kubectl -n <namespace> get deploy,statefulset,pod,service,ingressroute,pvc

/opt/k3s kubectl -n <namespace> rollout status deployment/<application>

/opt/k3s kubectl -n <namespace> logs deployment/<application>

/opt/k3s kubectl -n <namespace> get deployment <application> \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="app")].image}{"\n"}'

/opt/k3s kubectl -n <namespace> get pods \
  -l app.kubernetes.io/name=<application> \
  -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,REQUESTED:.spec.containers[0].image,RUNNING:.status.containerStatuses[0].imageID,CREATED:.metadata.creationTimestamp'
```

The `REQUESTED` and `RUNNING` values should contain the same `sha256` digest.
Do not infer success merely from a green CI build or an Argo CD sync result.

From a workstation connected to Headscale and authorized for the gateway:

```sh
# Test the gateway DNS server directly, over UDP and TCP.
dig @100.110.0.90 <application>.k8s-vpn.sea.watch A +short
dig +tcp @100.110.0.90 <application>.k8s-vpn.sea.watch A +short

# Test OS split DNS (Linux); on macOS use dscacheutil -q host -a name <hostname>.
getent ahostsv4 <application>.k8s-vpn.sea.watch

# Verify HTTPS using the device's normal resolver and certificate validation.
curl --fail --show-error https://<application>.k8s-vpn.sea.watch/<health-path>

# Isolate routing/TLS from client DNS if the normal request fails.
curl --fail --show-error \
  --resolve <application>.k8s-vpn.sea.watch:443:100.110.0.90 \
  https://<application>.k8s-vpn.sea.watch/<health-path>
```

Both direct DNS queries and OS resolution should yield `100.110.0.90`.
`dig` without an explicit server does not exercise OS split DNS correctly on
every platform, so use the OS lookup and a normal browser request too. Use the
application's real health path and expected response; authentication may be
required for other endpoints. Check login, redirects, WebSockets, and OIDC
callbacks where relevant.

Verify that the same Host/SNI does not serve the app on the public Traefik VIP:

```sh
curl --verbose --connect-timeout 5 --max-time 15 \
  --resolve <application>.k8s-vpn.sea.watch:443:168.119.131.210 \
  https://<application>.k8s-vpn.sea.watch/<health-path>
```

There must be no application response through the public VIP. A valid TLS
certificate alone is not evidence of public exposure: the shared Traefik can
select a certificate without having a matching public HTTP router. If TLS
fails before HTTP, an operator can repeat with `--insecure` solely to inspect
the HTTP routing; do not use that flag for the successful private TLS test.
Also test from a tailnet user outside `group:kubernetes-gateway-users`; gateway
connections must be denied. Existing `argocd.vpn.sea.watch` remains the Argo CD
address; use the actual application hostname to test the new zone.

Application onboarding assumes the shared gateway is already deployed. Do not
resync or restart Headscale, Traefik, or the gateway for every new application.

## 10. Common failures

### Private hostname does not resolve

- Verify Tailscale is connected and the client accepts Tailscale DNS.
- Compare a direct query to `100.110.0.90` with the OS resolver lookup.
- If direct DNS times out, check the gateway's DNS container and Headscale
  port-53 ACL with a platform operator.
- If direct DNS works but OS resolution fails, check client split DNS and any
  browser-specific Secure DNS override.
- Do not add a public DNS record or a per-app Headscale record as a workaround.

### Private DNS works but HTTPS fails

- Check the gateway, the private `traefik-tailnet` Service, and the exact Host
  matcher on the IngressRoute.
- Verify the route uses `vpnwebsecure`, has `tls: {}`, and its Service has ready
  endpoints on the correct port.
- For certificate errors, ask the platform operator to check the shared
  wildcard Certificate and TLSStore; do not copy the TLS Secret into the app.
- For 502/504 responses, check Service endpoints, application binding, and the
  NetworkPolicy allowing Traefik to reach the pod's actual port.

### `Forbidden` from kubectl

- This means authentication may have succeeded but Kubernetes RBAC denied the
  operation. Check `kubectl auth whoami` and `kubectl auth can-i`.
- Ask the operator to bootstrap the AppProject/Application or provide the
  intended namespace permissions. Do not assume an admin-looking username or
  Argo CD UI permissions grant Kubernetes cluster-admin access.

### `repository not accessible` or `invalid pkt-len found`

- Verify the repository URL and selected SSH transport in Argo CD.
- Verify the private key corresponds to a public deploy key in Gitea.
- Test `git ls-remote` with the same credentials.

### Repository or destination not permitted by AppProject

- Add the exact repository URL to `sourceRepos`.
- Make the destination name/server and namespace match the Application.
- Permit Namespace as a cluster-scoped resource if the app creates one.

### `ImagePullBackOff` with anonymous token `401 Unauthorized`

- Verify `gitea-registry` exists in the application namespace.
- Verify the SealedSecret produced a Secret of type
  `kubernetes.io/dockerconfigjson`.
- Verify the PAT can read the requested private package.
- Verify `imagePullSecrets` references the exact Secret name.

Argo CD creating a missing pull Secret does not necessarily retry an existing
failed pod immediately. After the Secret is confirmed, delete only the failed
application pod or make a pod-template change so the Deployment creates a new
pod.

### PVC remains Pending

- Inspect PVC events and Ceph CSI provisioner logs.
- Compare Ceph monitor connectivity from a node and from the provisioner pod.
- For `rados: ret=-110`, verify the shared provisioner host-network setting.
- For `didn't have free ports`, verify the provisioner metrics port is 8081.

### Startup probe gets IPv6 `connection refused`

- Bind the application to `::`, not only `0.0.0.0`.
- Verify the application listens on the declared container port.

### Init container repeatedly restarts after an application build

- Compare the init-container image with the application image.
- Ensure CI updated only the named primary container.
- Read the current and previous init-container logs.

## 11. Static Netlify frontend backed by Strapi

This is an existing public-deployment example, not the default private ingress
method. Netlify's hosted build runners cannot normally resolve or reach
`*.k8s-vpn.sea.watch`. A frontend that fetches a private API during builds needs
an explicitly arranged private build/network path; changing the URL alone is
insufficient. Do not expose the API publicly just to make the build pass.

For the existing Justice Fleet static SvelteKit frontend, Netlify needs:

```text
PUBLIC_STRAPI_URL=https://justice-fleet-cms.sea.watch/
GRAPHQL_ENDPOINT=https://justice-fleet-cms.sea.watch/graphql
NODE_VERSION=24.18.1                 # optional if app/.nvmrc is honored
```

Keep the trailing slash on `PUBLIC_STRAPI_URL` when frontend code concatenates
paths such as `api/i18n/locales`.

The frontend uses the static SvelteKit adapter and fetches Strapi content while
building. Publishing content in Strapi therefore does not update the deployed
HTML until Netlify rebuilds it.

Recommended publishing flow:

1. create a Netlify Build Hook for the production branch;
2. store its URL in a Strapi webhook, never in the public repository;
3. trigger it on publish, unpublish, and delete events;
4. avoid triggering a production build for every draft save.

If content must update without a build, redesign the frontend to use SSR or
runtime API requests. That is an architectural change, not an environment
variable change.

## 12. Operational cautions

- Keep application GitOps configuration self-contained in the application
  repository, but do not duplicate shared cluster controllers.
- Commit only encrypted SealedSecrets, never plaintext credentials or backup
  archives containing production data.
- Inspect SQL and media backups before any restore.
- Keep registry credentials, Git credentials, and runtime secrets separate.
- Use immutable image digests and verify the running `imageID`.
- Do not delete PVCs as a troubleshooting shortcut.
- Add tested backups before calling a stateful deployment production-ready.
- Preserve unrelated local changes when updating deployment manifests.

## 13. Copyable agent handoff

Copy this guide and the Sealed Secrets public certificate into, or make them
available to, the application checkout. Give the agent the application name,
Gitea organization/repository, namespace, container port, health endpoint,
storage needs, and chosen authentication method. For example:

```text
Prepare this repository for deployment to the Sea-Watch Kubernetes cluster
using KUBERNETES_GITOPS_DEPLOYMENT_GUIDE.md.

Use the actual application in this checkout as the first test of the new
private app domain. Choose https://<application>.k8s-vpn.sea.watch; do not add
an Argo CD alias or change shared platform routing to test it.

Inspect the application, existing Docker/CI/deployment files, and repository
instructions first. Adapt what is already present. Identify the application
port, health check, image user, required secrets, external URL settings,
database, migrations, and persistent paths. Preserve unrelated work.

Implement the Dockerfile and Gitea image/digest workflow as needed, plus
deploy/kubernetes manifests and deploy/argocd bootstrap resources. Use a
ClusterIP Service, an exact-Host IngressRoute on vpnwebsecure with tls: {},
and a NetworkPolicy allowing Traefik to reach the application pod port.
Use the shared wildcard certificate. Configure application authentication
and its callback URLs for the chosen hostname. Do not assume the gateway
authenticates users to the application.

Do not create public DNS, a standard Kubernetes Ingress for this zone,
per-application Headscale records, TLS certificate copies, or shared platform
controllers. Do not change datacenter-infra. If a platform prerequisite is
missing, report it to the operator.

Keep credentials out of Git and chat. Generate only encrypted SealedSecrets
using the supplied public certificate and an approved local secret source.
Document any missing credential setup without inventing secret values.

Validate manifests and the container locally where possible. Offline parsing
does not validate live CRDs or admission policies. Provide exact operator
steps for Actions secrets, registry pull access, Argo CD repository access,
AppProject/Application bootstrap, initial sync, and DNS/TLS/application tests.
Include public-VIP and unauthorized-user denial checks. Distinguish static
checks from live results. Leave commit, push, deployment, data imports, and
shared infrastructure changes to the operator unless explicitly authorized.
```
