#!/usr/bin/env python3
"""Update only CRM application/tool references, leaving stateful images intact."""
import argparse
from pathlib import Path
import re

APP = "git.sea.watch/it-department/crm"
TOOLS = APP + "-tools"
ROOT = Path(__file__).resolve().parents[1]


def update(root: Path, app: str, tools: str) -> None:
    for repository, value in [(APP, app), (TOOLS, tools)]:
        if not re.fullmatch(re.escape(repository) + r"@sha256:[a-f0-9]{64}", value):
            raise ValueError("Expected immutable digests for the configured CRM repositories")
    counts = {APP: 0, TOOLS: 0}
    changes = []

    def replace(match):
        current = match.group(2)
        for repository, value in [(APP, app), (TOOLS, tools)]:
            if current.startswith(repository + ":") or current.startswith(repository + "@"):
                counts[repository] += 1
                return match.group(1) + value + match.group(3)
        return match.group(0)

    for directory in [root / "kubernetes", root / "operations"]:
        for path in sorted(directory.glob("*.yaml")):
            before = path.read_text()
            after = re.sub(r"(?m)^(\s*image:\s*)([^\s]+)([ \t]*)$", replace, before)
            changes.append((path, after))
    if counts != {APP: 2, TOOLS: 3}:
        raise ValueError("Unexpected application/tool image count; review manifests before updating")
    for path, value in changes:
        path.write_text(value)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-image", required=True)
    parser.add_argument("--tools-image", required=True)
    args = parser.parse_args()
    update(ROOT, args.app_image, args.tools_image)
