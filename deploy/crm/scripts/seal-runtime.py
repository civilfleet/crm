#!/usr/bin/env python3
"""Read approved VM docker-inspect JSON on stdin; write only SealedSecrets."""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import quote, unquote, urlparse, parse_qs
import yaml

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"AUTH_SECRET", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "NEXT_AWS_S3_ACCESS_KEY", "NEXT_AWS_S3_ACCESS_SECRET", "INTEGRATION_SECRET_ENCRYPTION_KEYS", "CRON_SECRET"}
OPTIONAL = {"SMTP_SECURE", "CHIBIGEO_SECRET", "PHOTON_BASE_URL", "SENTRY_DSN", "INBOUND_EMAIL_TRUSTED_AUTHSERV_IDS", "SCALEWAY_EMAIL_SNS_TOPIC_ARNS", "SCALEWAY_SNS_TRUST_CHAIN_PEM", "SCALEWAY_SNS_TRUST_CHAIN_PEM_BASE64", "EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS", "EMAIL_ATTACHMENT_BLOCKED_MIME_TYPES", "EMAIL_PROVIDER_REQUEST_TIMEOUT_MS", "EMAIL_CONNECTION_TIMEOUT_MS", "EMAIL_GREETING_TIMEOUT_MS", "EMAIL_SOCKET_TIMEOUT_MS"}


def source_environment(containers):
    selected = {}
    for container in containers:
        config = container.get("Config", {})
        role = (config.get("Labels") or {}).get("com.docker.compose.service")
        if role in ["app", "worker"]:
            if role in selected:
                raise ValueError("Expected exactly one source web and worker container")
            selected[role] = dict(item.split("=", 1) for item in config.get("Env", []) if "=" in item)
    if set(selected) != {"app", "worker"}:
        raise ValueError("Source inspection must contain both Compose app and worker services")
    web, worker = selected["app"], selected["worker"]
    shared = REQUIRED | OPTIONAL | {"DATABASE_URL", "INBOUND_EMAIL_ENCRYPTION_KEY"}
    for key in shared:
        if worker.get(key) and web.get(key) and worker[key] != web[key]:
            raise ValueError(f"Source web/worker disagree on {key}; resolve before sealing")
    web_key = web.get("INBOUND_EMAIL_ENCRYPTION_KEY") or web.get("AUTH_SECRET", "")
    worker_key = worker.get("INBOUND_EMAIL_ENCRYPTION_KEY") or worker.get("AUTH_SECRET", "")
    if web_key != worker_key:
        raise ValueError("Source web/worker have different effective inbound encryption keys")
    result = {**worker, **web}
    # Preserve the source code's legacy fallback without rotating encryption.
    result["INBOUND_EMAIL_ENCRYPTION_KEY"] = result.get("INBOUND_EMAIL_ENCRYPTION_KEY") or result.get("AUTH_SECRET", "")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cert", type=Path, required=True)
    parser.add_argument("--extra-env", type=Path, help="Approved JSON containing missing runtime keys, never conflicting replacements")
    args = parser.parse_args()
    source = source_environment(json.load(sys.stdin))
    if args.extra_env:
        for key, value in json.loads(args.extra_env.read_text()).items():
            if key not in REQUIRED | OPTIONAL or not isinstance(value, str):
                raise ValueError("Unexpected supplementary runtime key")
            if source.get(key) and source[key] != value:
                raise ValueError(f"Refusing to replace an existing source key: {key}")
            source[key] = value
    missing = REQUIRED - {key for key, value in source.items() if value}
    if missing:
        raise ValueError("Missing approved runtime keys: " + ", ".join(sorted(missing)))
    url = urlparse(source.get("DATABASE_URL", ""))
    if url.hostname not in ["postgres", "crm-postgres"] or unquote(url.username or "") != "crm" or url.path != "/crm" or parse_qs(url.query).get("schema", ["public"]) != ["public"]:
        raise ValueError("The source DB identity differs from the VM definition. Inventory the actual target before migrating")
    if not url.password or source.get("NEXT_AWS_S3_BUCKET_NAME") != "crm":
        raise ValueError("Expected an explicit source database password and the crm bucket")
    password = unquote(url.password)
    runtime = {key: source[key] for key in REQUIRED | OPTIONAL | {"INBOUND_EMAIL_ENCRYPTION_KEY"} if source.get(key)}
    runtime["DATABASE_URL"] = f"postgresql://crm:{quote(password, safe='')}@crm-postgres:5432/crm"
    # Registry pull credentials are separate from the VM's runtime secrets.
    registry_user = os.environ.get("CRM_REGISTRY_USERNAME")
    registry_token = os.environ.get("CRM_REGISTRY_TOKEN")
    if not registry_user or not registry_token:
        raise ValueError("CRM_REGISTRY_USERNAME and CRM_REGISTRY_TOKEN are required for private image pulls")
    auth = base64.b64encode(f"{registry_user}:{registry_token}".encode()).decode()
    storage_auth = json.dumps({"identities": [{"name": "crm", "credentials": [{"accessKey": runtime["NEXT_AWS_S3_ACCESS_KEY"], "secretKey": runtime["NEXT_AWS_S3_ACCESS_SECRET"]}], "actions": ["Admin", "Read", "List", "Tagging", "Write"]}]})
    secrets = {
        "crm-runtime": ("Opaque", runtime),
        "crm-postgres": ("Opaque", {"POSTGRES_PASSWORD": password}),
        "crm-storage-auth": ("Opaque", {"s3.json": storage_auth}),
        "crm-reminder-auth": ("Opaque", {"CRON_SECRET": runtime["CRON_SECRET"]}),
        "gitea-registry": ("kubernetes.io/dockerconfigjson", {".dockerconfigjson": json.dumps({"auths": {"git.sea.watch": {"auth": auth}}})}),
    }
    output = ROOT / "kubernetes"
    candidates = []
    for name, (kind, values) in secrets.items():
        path = output / f"{name}-sealed.yaml"
        if path.exists():
            raise ValueError("Existing sealed manifests must be reviewed before replacement")
        document = {"apiVersion": "v1", "kind": "Secret", "metadata": {"name": name, "namespace": "crm"}, "type": kind, "data": {k: base64.b64encode(v.encode()).decode() for k, v in values.items()}}
        result = subprocess.run(["kubeseal", "--cert", str(args.cert.resolve()), "--scope", "strict", "--format", "yaml"], input=json.dumps(document), text=True, capture_output=True)
        if result.returncode:
            raise ValueError("Sealing failed; verify the public certificate and kubeseal installation")
        candidates.append((path, result.stdout))
    kustomization = output / "kustomization.yaml"
    config = yaml.safe_load(kustomization.read_text())
    for path, value in candidates:
        path.write_text(value)
        config["resources"].append(path.name)
    kustomization.write_text(yaml.safe_dump(config, sort_keys=False))
    print("Wrote five namespace-scoped SealedSecrets. No plaintext secret files were written.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        # Only our controlled configuration errors reach output, never source
        # inspect JSON, passwords, or external CLI diagnostics.
        print(str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else "Cannot prepare sealed runtime; verify local input and tools.", file=sys.stderr)
        sys.exit(1)
