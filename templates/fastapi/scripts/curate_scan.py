#!/usr/bin/env python3
# scripts/curate_scan.py — the DETERMINISTIC core of /curate (read-only planner).
#
# Grouping and counting must not be an LLM's job — it miscounts. This reads the
# recorded failures + the existing lessons' `signatures` and emits a PLAN of what
# /curate should do. The /curate skill applies the plan (writing new-lesson bodies /
# disambiguating coarse signatures is the only judgment left to the model). Writes
# nothing. Pure stdlib so it runs with a bare `python3` (no uv/venv) — a leaf script
# that must never itself fail the gate.
#
# Usage: python3 scripts/curate_scan.py   →   prints a JSON plan:
#   { "create": [{signature, plans, seen, message, file}],
#     "increment": [{id, signature, seen, plans, lastSeen}],
#     "disambiguate": [{signature, plans, candidates:[id,...]}],
#     "promotionReady": [{id, seen, status}] }         # seen>=3 AND status DISTILLED

import json
import re
import sys
from pathlib import Path

FAILURES = ".rigel/gate-failures.jsonl"
LESSONS = "docs/design-docs/lessons"


def _to_int(value: object) -> int:
    """Faithful stand-in for JS `Number(x || 0)` that never raises (leaf must not crash)."""
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return 0


def read_failures() -> list[dict]:
    path = Path(FAILURES)
    if not path.exists():
        return []
    out: list[dict] = []
    for line in path.read_text(encoding="utf-8").split("\n"):
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except (ValueError, TypeError):
            continue
    return out


# tiny frontmatter reader — only the fields we need, one value per line
def read_lessons() -> list[dict]:
    directory = Path(LESSONS)
    if not directory.exists():
        return []
    out: list[dict] = []
    for entry in sorted(directory.iterdir()):
        f = entry.name
        if not (f.startswith("LSN-") and f.endswith(".md")):
            continue
        txt = entry.read_text(encoding="utf-8")
        parts = txt.split("---")
        fm = parts[1] if len(parts) > 1 else ""

        def get(k: str, _fm: str = fm) -> str | None:
            m = re.search(rf"^{k}:\s*(.+)$", _fm, re.M)
            return m.group(1).strip() if m else None

        sig_raw = get("signatures") or "[]"
        inner = re.sub(r"^\[|\]$", "", sig_raw)
        signatures = []
        for s in inner.split(","):
            t = re.sub(r"""^["']|["']$""", "", s.strip())
            if t:
                signatures.append(t)
        out.append(
            {
                "file": f,
                "id": get("id"),
                "status": get("status"),
                "seen": _to_int(get("seen") or 0),
                "signatures": signatures,
            }
        )
    return out


def scan(failures: list[dict], lessons: list[dict]) -> dict:
    by_sig: dict[str, set] = {}  # signature -> set(plans)
    sample: dict[str, dict] = {}  # signature -> {message, file} (first occurrence)
    for r in failures:
        sig = r.get("signature")
        if sig not in by_sig:
            by_sig[sig] = set()
            sample[sig] = {"message": r.get("message"), "file": r.get("file")}
        if r.get("plan"):
            by_sig[sig].add(r["plan"])

    plan: dict = {"create": [], "increment": [], "disambiguate": [], "promotionReady": []}
    for signature, plans_set in by_sig.items():
        plans = sorted(plans_set)
        occ = max(len(plans_set), 1)  # distinct plans; a same-plan repeat still counts once
        matches = [lesson for lesson in lessons if signature in lesson["signatures"]]
        if len(matches) == 0:
            plan["create"].append({"signature": signature, "plans": plans, "seen": occ, **sample[signature]})
        elif len(matches) == 1:
            lesson = matches[0]
            new_seen = lesson["seen"] + occ
            plan["increment"].append(
                {
                    "id": lesson["id"],
                    "signature": signature,
                    "seen": new_seen,
                    "plans": plans,
                    "lastSeen": plans[-1] if plans else None,
                }
            )
            if new_seen >= 3 and lesson["status"] == "DISTILLED":
                plan["promotionReady"].append({"id": lesson["id"], "seen": new_seen, "status": lesson["status"]})
        else:
            plan["disambiguate"].append(
                {"signature": signature, "plans": plans, "candidates": [m["id"] for m in matches]}
            )

    # lessons already at seen>=3 + DISTILLED (independent of this run) are promotion-ready too
    for lesson in lessons:
        if (
            lesson["seen"] >= 3
            and lesson["status"] == "DISTILLED"
            and not any(p["id"] == lesson["id"] for p in plan["promotionReady"])
        ):
            plan["promotionReady"].append({"id": lesson["id"], "seen": lesson["seen"], "status": lesson["status"]})
    return plan


if __name__ == "__main__":
    result = scan(read_failures(), read_lessons())
    sys.stdout.write(json.dumps(result, indent=2) + "\n")
