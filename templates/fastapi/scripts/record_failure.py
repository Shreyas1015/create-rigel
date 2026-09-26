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
import subprocess
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


def head_commit() -> str | None:
    """Short HEAD, or None outside a repo — then records simply lack the dedupe key."""
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=False)
        return out.stdout.strip() or None
    except OSError:
        return None


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

    # One record per signature per commit (PLAN-024 AC-4): the gate records its own failures now, and
    # re-running a red gate while fixing it must not inflate the recurrence /curate promotes on.
    commit = head_commit()
    log = Path(".rigel/gate-failures.jsonl")
    if commit and log.exists():
        for line in log.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("signature") == signature and r.get("commit") == commit:
                print(f"already recorded at {commit}: {signature}")
                return
    rec = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "plan": active_plan_id(),
        "commit": commit,
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
