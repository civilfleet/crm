#!/usr/bin/env python3
"""Offline checks only. --ready also requires sealed credentials and image digests."""
import argparse
from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
SECRET_KEYS = {
    "crm-runtime": {"DATABASE_URL", "AUTH_SECRET", "INTEGRATION_SECRET_ENCRYPTION_KEYS", "INBOUND_EMAIL_ENCRYPTION_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "NEXT_AWS_S3_ACCESS_KEY", "NEXT_AWS_S3_ACCESS_SECRET"},
    "crm-postgres": {"POSTGRES_PASSWORD"},
    "crm-storage-auth": {"s3.json"},
    "crm-reminder-auth": {"CRON_SECRET"},
    "gitea-registry": {".dockerconfigjson"},
}


def validate(ready: bool):
    errors = []
    resources = []
    for directory in ["kubernetes", "operations", "argocd"]:
        for path in sorted((ROOT / directory).glob("*.yaml")):
            for doc in yaml.safe_load_all(path.read_text()):
                if not doc or doc.get("kind") == "Kustomization":
                    continue
                resources.append(doc)
                kind = doc.get("kind")
                name = doc.get("metadata", {}).get("name", path.name)
                ns = doc.get("metadata", {}).get("namespace")
                if kind != "Namespace" and ns != ("argocd" if kind in ["Application", "AppProject"] else "crm"):
                    errors.append(f"{name}: wrong namespace")
                if kind == "Secret":
                    errors.append(f"{name}: plaintext Secret must not be committed")
                if kind in ["Ingress", "TLSStore", "ClusterIssuer", "ClusterRole"]:
                    errors.append(f"{name}: shared platform resource is outside this deployment")
                spec = doc.get("spec", {})
                if kind == "Service" and spec.get("type", "ClusterIP") != "ClusterIP":
                    errors.append(f"{name}: externally exposed Service")
                if kind == "IngressRoute":
                    if spec.get("entryPoints") != ["vpnwebsecure"] or spec.get("tls", {}).get("secretName") != "crm-existing-hostnames-tls":
                        errors.append(f"{name}: expected private entrypoint and namespace-local certificate")
                    allowed = {"Host(`crm.vpn.sea.watch`)", "Host(`crm-s3.vpn.sea.watch`)"}
                    if any(route.get("match") not in allowed for route in spec.get("routes", [])):
                        errors.append(f"{name}: unexpected host matcher")
                pod = spec.get("jobTemplate", {}).get("spec", {}).get("template", {}) if kind == "CronJob" else spec.get("template", {})
                if pod:
                    ps = pod.get("spec", {})
                    if ps.get("automountServiceAccountToken") is not False or not ps.get("securityContext", {}).get("runAsNonRoot"):
                        errors.append(f"{name}: missing pod isolation")
                    for container in ps.get("containers", []) + ps.get("initContainers", []):
                        image = container.get("image", "")
                        if ready and not re.fullmatch(r".+@sha256:[a-f0-9]{64}", image):
                            errors.append(f"{name}: image not pinned to a digest")
                        cs = container.get("securityContext", {})
                        if cs.get("allowPrivilegeEscalation") is not False or "ALL" not in cs.get("capabilities", {}).get("drop", []):
                            errors.append(f"{name}: missing container isolation")
                        if any(port.get("hostPort") for port in container.get("ports", [])) or ps.get("hostNetwork"):
                            errors.append(f"{name}: host network exposure")
                if kind == "StatefulSet":
                    if spec.get("persistentVolumeClaimRetentionPolicy") != {"whenDeleted": "Retain", "whenScaled": "Retain"}:
                        errors.append(f"{name}: unsafe PVC retention")
                    if any(c.get("spec", {}).get("storageClassName") != "ceph-rbd" for c in spec.get("volumeClaimTemplates", [])):
                        errors.append(f"{name}: wrong storage class")
    sealed = {r["metadata"]["name"]: r for r in resources if r.get("kind") == "SealedSecret"}
    if ready:
        for name, keys in SECRET_KEYS.items():
            encrypted = sealed.get(name, {}).get("spec", {}).get("encryptedData", {})
            if not keys.issubset(encrypted):
                errors.append(f"{name}: missing sealed keys: {', '.join(sorted(keys - encrypted.keys()))}")
    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        return 1
    print(f"Validated {len(resources)} resources offline. " + ("Sealed keys and image digests present." if ready else "Draft: source secrets and application image digests are still required."))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ready", action="store_true")
    sys.exit(validate(parser.parse_args().ready))
