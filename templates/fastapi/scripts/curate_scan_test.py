#!/usr/bin/env python3
# scripts/curate_scan_test.py — run: python3 scripts/curate_scan_test.py
# Unit-tests the deterministic /curate core (grouping/counting/matching must not drift).
# Pure stdlib self-test — mirrors templates/express/scripts/curate-scan.test.mjs 1:1.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curate_scan import scan  # noqa: E402


def fail(signature: str, plan: str, message: str = "m", file: str = "f") -> dict:
    return {"signature": signature, "plan": plan, "message": message, "file": file}


def lesson(
    id: str,
    signatures: list[str],
    status: str = "OBSERVED",
    seen: int = 1,
    last_seen: str = "PLAN-001",
) -> dict:
    return {
        "id": id,
        "signatures": signatures,
        "status": status,
        "seen": seen,
        "lastSeen": last_seen,
        "file": f"{id}.md",
    }


# ── no matching lesson → create, seen = distinct plans ──
p = scan(
    [
        fail("arch:raw-orm-row", "PLAN-001"),
        fail("arch:raw-orm-row", "PLAN-002"),
        fail("arch:raw-orm-row", "PLAN-003"),
    ],
    [],
)
assert len(p["create"]) == 1
assert p["create"][0]["signature"] == "arch:raw-orm-row"
assert p["create"][0]["seen"] == 3, "three distinct plans → seen 3"
assert len(p["increment"]) == 0
assert len(p["promotionReady"]) == 0

# ── same plan repeated → counts once (distinct plans, not raw lines) ──
p = scan([fail("mypy:arg-type", "PLAN-001"), fail("mypy:arg-type", "PLAN-001")], [])
assert p["create"][0]["seen"] == 1, "same plan twice → seen 1"

# ── matches one lesson → increment; crosses 3 + DISTILLED → promotion-ready ──
p = scan(
    [fail("arch:isolation-test-missing", "PLAN-007"), fail("arch:isolation-test-missing", "PLAN-008")],
    [lesson("LSN-0007", ["arch:isolation-test-missing"], "DISTILLED", 1)],
)
assert len(p["increment"]) == 1
assert p["increment"][0]["id"] == "LSN-0007"
assert p["increment"][0]["seen"] == 3, "1 + 2 distinct plans"
assert [x["id"] for x in p["promotionReady"]] == ["LSN-0007"]

# ── increment to 3 but status not DISTILLED → NOT promotion-ready (epistemic gate) ──
p = scan(
    [fail("arch:x", "PLAN-001"), fail("arch:x", "PLAN-002")],
    [lesson("LSN-0001", ["arch:x"], "OBSERVED", 1)],
)
assert p["increment"][0]["seen"] == 3
assert len(p["promotionReady"]) == 0, "count alone does not promote — needs DISTILLED"

# ── coarse signature claimed by >1 lesson → disambiguate (model decides) ──
p = scan(
    [fail("mypy:arg-type", "PLAN-001")],
    [lesson("LSN-A", ["mypy:arg-type"]), lesson("LSN-B", ["mypy:arg-type"])],
)
assert len(p["disambiguate"]) == 1
assert sorted(p["disambiguate"][0]["candidates"]) == ["LSN-A", "LSN-B"]
assert len(p["create"]) == 0
assert len(p["increment"]) == 0

# ── already seen>=3 + DISTILLED (no new failures) → still promotion-ready ──
p = scan([], [lesson("LSN-0003", ["sig"], "DISTILLED", 4)])
assert [x["id"] for x in p["promotionReady"]] == ["LSN-0003"]

# ── stale: OBSERVED + untouched for >=5 plans → delete candidate (never auto-deleted) ──
p = scan([], [lesson("LSN-0002", ["sig"], "OBSERVED", 1, "PLAN-001")], 6)
assert [s["id"] for s in p["staleCandidates"]] == ["LSN-0002"]
assert p["staleCandidates"][0]["plansSince"] == 5

# ── NOT stale: climbed the ladder, or recently seen, or recurred in this very run ──
# DISTILLED lessons never go stale — they generalised, they're just waiting to be enforced
assert len(scan([], [lesson("LSN-A", ["s"], "DISTILLED", 1, "PLAN-001")], 9)["staleCandidates"]) == 0
# seen 2 plans ago → under the threshold
assert len(scan([], [lesson("LSN-B", ["s"], "OBSERVED", 1, "PLAN-004")], 6)["staleCandidates"]) == 0
# recurred in THIS run → incremented, not stale
p = scan([fail("s", "PLAN-006")], [lesson("LSN-C", ["s"], "OBSERVED", 1, "PLAN-001")], 6)
assert len(p["increment"]) == 1
assert len(p["staleCandidates"]) == 0, "a lesson that just recurred is not stale"

# ── no current plan → no stale claims (can't compute age honestly) ──
assert len(scan([], [lesson("LSN-D", ["s"], "OBSERVED", 1, "PLAN-001")], None)["staleCandidates"]) == 0

print("curate-scan: all assertions passed")
