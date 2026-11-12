# Registration bridge CORS

The durable source of `PUBLIC_EVENTS_ORIGINS` is the explicit `env` entry in
`deploy/seawatch-api/kubernetes/api.yaml`, on container `api` in Deployment
`seawatch-api`. It is not supplied by a SealedSecret, Netlify, or the CRM VM.
`scripts/public-api.ts` reads the comma-separated list at startup and performs
exact string matching. Traefik routes to the API without adding CORS middleware.

The configured origins are:

- `https://seawatch-events.netlify.app` (preserved existing entry)
- `https://sea-watch.org`
- `https://dev-bridge-integration--seawatch.netlify.app` (website publisher alias on sea-watch-cms-deploy `main`)
- `https://staging--seawatch.netlify.app` (website publisher alias `staging` on sea-watch-cms-deploy `staging`, since the staging stream replaced the dev stream)

On 2026-11-06, a read-only Netlify API lookup confirmed the website site name
`seawatch`, site ID `e0ebee07-e5b1-48c7-ab11-8a75499b9bfa`, and custom domain
`sea-watch.org`. The website publisher's `NETLIFY_DEPLOY_ALIAS` applies to draft
deploys and forms the approved hostname above. That alias currently returns
404; CORS configuration does not publish or create the preview itself.
`https://www.sea-watch.org/` returned HTTP 301 to `https://sea-watch.org/`, so
`www` is intentionally excluded. Other Netlify aliases are not authorized.

Allowed responses reflect the exact origin, preserve `Vary: Origin`, and expose
`Retry-After`. This applies before validation and registration processing, so
HTTP 400/413/415, 429 and 503 retain the same CORS headers. Preflight returns 204
and permits `POST, OPTIONS` with `Content-Type, Idempotency-Key`. Rejected
registration origins return 403 without allow-origin or expose headers. No
cookies or `Access-Control-Allow-Credentials` are introduced; browsers should
continue to submit with `credentials: 'omit'`.

## Authorized operator rollout

These are instructions only; implementation and local tests do not deploy.

1. Commit the four CORS task files, then push CRM `main`:

   ```sh
   git push origin main
   ```

2. In Gitea repository **IT-Department/crm**, run the manual **Public API image**
   workflow (`.gitea/workflows/public-api-image.yaml`) on `main`. Wait for it to
   pass and commit the new digest to `deploy/seawatch-api/kubernetes/api.yaml`.
   Keep `main` stable while it runs: its stale-build guard skips digest recording
   if another commit reaches `main`. Check that the digest commit was created;
   a completed build alone does not prove the image was selected for deployment.
   The ordinary CRM image workflow does not rebuild or deploy this bridge.

3. Argo Application `seawatch-api` tracks `main` at
   `deploy/seawatch-api/kubernetes` with automated sync. Allow it to reconcile,
   or explicitly sync from an authenticated operator terminal:

   ```sh
   argocd app sync seawatch-api
   argocd app wait seawatch-api --sync --health --timeout 300
   kubectl --context sea-watch -n seawatch-api rollout status deployment/seawatch-api --timeout=180s
   kubectl --context sea-watch -n seawatch-api get deployment seawatch-api \
     -o jsonpath='{.spec.template.spec.containers[?(@.name=="api")].image}{"\n"}{.spec.template.spec.containers[?(@.name=="api")].env[?(@.name=="PUBLIC_EVENTS_ORIGINS")].value}{"\n"}'
   ```

   Confirm the image is the workflow's new digest and the environment value is
   the exact three-origin list above. No secret regeneration or VM Ansible run
   is required.

## Post-rollout verification — OPTIONS only

After the authorized rollout, run:

```sh
for origin in \
  https://seawatch-events.netlify.app \
  https://sea-watch.org \
  https://dev-bridge-integration--seawatch.netlify.app \
  https://staging--seawatch.netlify.app \
  https://unapproved.example
do
  printf '\nOrigin: %s\n' "$origin"
  curl --silent --show-error --max-time 20 --include --request OPTIONS \
    --header "Origin: $origin" \
    --header 'Access-Control-Request-Method: POST' \
    --header 'Access-Control-Request-Headers: Content-Type, Idempotency-Key' \
    https://api.sea.watch/v1/events/registrations
done
```

The three approved origins must return 204, matching
`Access-Control-Allow-Origin`, `Vary: Origin`, allow-methods including POST,
allow-headers including Content-Type and Idempotency-Key, and
`Access-Control-Expose-Headers: Retry-After`. The unapproved origin must return
403 without an allow-origin header. None should enable credentials or set a
cookie. A Retry-After value itself is expected on rate-limit responses, not on
preflight. Do not submit registrations to test CORS or induce a live rate limit.

Local tests execute the actual bridge handler with HTTP/NATS boundaries mocked,
covering allowed/rejected preflights, validation errors, 429/503, and cooldown
exposure. The public JSON feed has separate CORS configuration and is unchanged.

## Website form submissions

`POST /v1/forms/submissions` on the same bridge uses this exact allowlist and
the same CORS behaviour; no origin change is needed for it. See
[`PUBLIC_FORMS_INTAKE.md`](PUBLIC_FORMS_INTAKE.md).
