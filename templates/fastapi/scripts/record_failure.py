#!/usr/bin/env python3
# scripts/record_failure.py — append ONE gate failure to .rigel/gate-failures.jsonl.
#
# This is the persistent record /curate consumes (the gate's own stdout is
# ephemeral). Called by the gate-checker for each FAIL item it reports, so
# recurrence can be counted across plans. Pure stdlib so it runs with a bare
# `python3` (no uv/venv) — the recorder is a leaf script that must never itself
# fail the gate.
#
# Usage:
#   python3 scripts/record_failure.py <signature> <message> [file[:line]]
#
# signature = {gate}:{stable-discriminator} — STABLE ACROSS FILES so the same class
# of failure in a different file counts as one lesson. Examples:
#   ruff:F401 · mypy:arg-type · bandit:B105 · arch:isolation-test-missing ·
#   arch:file-too-long · assert:zero-tests · ac-vector:AC-fail

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ACTIVE_DIR = "docs/exec-plans/active"


def active_plan_id() -> str | None:
    """Best-effort active-plan id for the seen/first_seen/last_seen bookkeeping."""
    d = Path(ACTIVE_DIR)
    if not d.exists():
        return None
    plans = sorted(p for p in d.iterdir() if p.suffix == ".md")
    if not plans:
        return None
    m = re.search(r"PLAN-\d{3}", plans[0].name)
    return m.group(0) if m else None


def main() -> None:
    args = sys.argv[1:]
    if len(args) < 2 or not args[0] or not args[1]:
        print(
            "usage: record_failure.py <signature> <message> [file[:line]]",
            file=sys.stderr,
        )
        raise SystemExit(2)

    signature, message = args[0], args[1]
    location = args[2] if len(args) > 2 else ""
    file_part, _, line_part = location.partition(":")

    Path(".rigel").mkdir(parents=True, exist_ok=True)

    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "plan": active_plan_id(),
        "signature": signature,
        "message": message,
        "file": file_part or None,
        "line": int(line_part) if line_part.isdigit() else None,
    }
    with open(".rigel/gate-failures.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec) + "\n")
    print(f"recorded gate failure: {signature}")


if __name__ == "__main__":
    main()
