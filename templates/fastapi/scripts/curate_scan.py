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
#     "promotionReady": [{id, seen, status}],          # seen>=3 AND status DISTILLED
#     "staleCandidates": [{id, lastSeen, plansSince, status}],   # OBSERVED and long-untouched
#     "overdue": [{id, promoteBy, status}] }           # /postmortem promote_by deadline passed
#
# Stale = still OBSERVED (never climbed the ladder) and not seen for STALE_AFTER plans: it was a
# one-off, not a class. Reported as a CANDIDATE only — a human deletes it. Un-deleted stale prose
# is the documented rot mode of lesson systems; nothing here auto-deletes.
#
# JSON keys stay camelCase to match templates/express/scripts/curate-scan.mjs byte for byte —
# /curate reads the same plan shape whichever stack it runs in.

import datetime
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
                "lastSeen": get("last_seen") or None,
                "promoteBy": get("promote_by") or None,
                "signatures": signatures,
            }
        )
    return out


STALE_AFTER = 5  # plans an OBSERVED lesson may go untouched before it's a delete candidate


def plan_num(p: str | None) -> int | None:
    m = re.search(r"PLAN-(\d+)", p or "")
    return int(m.group(1)) if m else None


def current_plan(failures: list[dict], lessons: list[dict]) -> int | None:
    """Current plan number: the active plan, else the newest plan mentioned anywhere."""
    active = Path("docs/exec-plans/active")
    if active.exists():
        for entry in sorted(active.iterdir()):
            n = plan_num(entry.name)
            if n:
                return n
    seen = [plan_num(f.get("plan")) for f in failures] + [plan_num(lesson.get("lastSeen")) for lesson in lessons]
    seen = [n for n in seen if n]
    return max(seen) if seen else None


def scan(failures: list[dict], lessons: list[dict], now_plan: int | None = None) -> dict:
    by_sig: dict[str, set] = {}  # signature -> set(plans)
    sample: dict[str, dict] = {}  # signature -> {message, file} (first occurrence)
    for r in failures:
        sig = r.get("signature")
        if sig not in by_sig:
            by_sig[sig] = set()
            sample[sig] = {"message": r.get("message"), "file": r.get("file")}
        if r.get("plan"):
            by_sig[sig].add(r["plan"])

    plan: dict = {
        "create": [],
        "increment": [],
        "disambiguate": [],
        "promotionReady": [],
        "staleCandidates": [],
        "overdue": [],
    }
    for signature, plans_set in by_sig.items():
        plans = sorted(plans_set)
        occ = max(len(plans_set), 1)  # distinct plans; a same-plan repeat still counts once
        matches = [lesson for lesson in lessons if signature in lesson["signatures"]]
        if len(matches) == 0:
            plan["create"].append({"signature": signature, "plans": plans, "seen": occ, **sample[signature]})
        elif len(matches) == 1:
            lesson = matches[0]
            new_seen = lesson["seen"] + occ
            entry = {"id": lesson["id"], "signature": signature, "seen": new_seen, "plans": plans}
            # No plans → the JS twin's `plans[plans.length - 1]` is undefined and JSON.stringify
            # DROPS the key. Omit it here too, or the two scanners emit different JSON for a
            # failure recorded with no active plan.
            if plans:
                entry["lastSeen"] = plans[-1]
            plan["increment"].append(entry)
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

    # overdue: a /postmortem lesson whose promote_by date has passed. A deadline nobody surfaces is
    # a deadline nobody meets — this is what makes the postmortem's promise real.
    # UTC date, to match the JS twin's `new Date().toISOString().slice(0, 10)`.
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    for lesson in lessons:
        if lesson["status"] == "ENFORCED" or not lesson.get("promoteBy"):
            continue
        if lesson["promoteBy"] < today:
            plan["overdue"].append(
                {"id": lesson["id"], "promoteBy": lesson["promoteBy"], "status": lesson["status"]}
            )

    # stale: still OBSERVED and untouched for STALE_AFTER plans → a one-off, not a class.
    # Never flagged if it recurred in THIS run (it just got incremented).
    if now_plan:
        touched = {i["id"] for i in plan["increment"]}
        for lesson in lessons:
            if lesson["status"] != "OBSERVED" or lesson["id"] in touched:
                continue
            last = plan_num(lesson.get("lastSeen"))
            if last is None:
                continue
            since = now_plan - last
            if since >= STALE_AFTER:
                plan["staleCandidates"].append(
                    {
                        "id": lesson["id"],
                        "lastSeen": lesson["lastSeen"],
                        "plansSince": since,
                        "status": lesson["status"],
                    }
                )
    return plan


if __name__ == "__main__":
    _failures = read_failures()
    _lessons = read_lessons()
    result = scan(_failures, _lessons, current_plan(_failures, _lessons))
    sys.stdout.write(json.dumps(result, indent=2) + "\n")
