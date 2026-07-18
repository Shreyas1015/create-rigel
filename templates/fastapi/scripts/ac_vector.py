#!/usr/bin/env python3
# scripts/ac_vector.py
#
# AC-1 (traceability gate -- the pass/fail vector). Grades the OUTCOME of a feature:
# for every AC-ID in the active plan's spec it emits one of
#
#   PASS     -- a test carrying the AC-ID passes, and it was proven red first
#   FAIL     -- the test exists and was red, but does not pass yet
#   MISSING  -- no acceptance test carries this AC-ID
#   INVALID  -- a test exists but has no recorded red state (red-green never proven)
#
# The vector is written to .rigel/ac-results/SPEC-XXX.json and appended to the plan's
# Progress Log. Exit is non-zero unless every AC is PASS -- so this is a FEATURE
# COMPLETION check (make ac-vector / garbage-collect), NOT a per-layer gate
# (acceptance tests are legitimately red mid-build). The per-layer gate enforces only
# the static traceability + assertion-integrity arch tests.
#
# Usage:  uv run python scripts/ac_vector.py

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.rigel_evals import (  # noqa: E402
    RESULTS_DIR,
    ac_ids_with_tests,
    read_redgreen,
    resolve_active_spec,
    run_acceptance_tests,
    write_json,
)


def main() -> None:
    resolved = resolve_active_spec()
    if not resolved:
        print("ac-vector: no active plan/spec -- nothing to grade.")
        raise SystemExit(0)

    plan_path = resolved["plan_path"]
    spec_id = resolved["spec_id"]
    acs = resolved["acs"]
    if not acs:
        print(
            f"[X] ac-vector: {spec_id} has no AC-IDs in its Acceptance Criteria section",
            file=sys.stderr,
        )
        raise SystemExit(1)

    with_tests = ac_ids_with_tests(spec_id)
    redgreen = read_redgreen(spec_id)
    results = run_acceptance_tests(spec_id)

    vector = []
    for ac in acs:
        ac_id = ac["id"]
        if ac_id not in with_tests:
            status = "MISSING"
        elif not redgreen or ac_id not in (redgreen.get("tests") or {}):
            status = "INVALID"
        elif results.get(ac_id) == "passed":
            status = "PASS"
        else:
            status = "FAIL"
        vector.append({"id": ac_id, "status": status, "text": ac["text"]})

    now = datetime.now(timezone.utc).isoformat()

    # Write the machine-readable artifact.
    write_json(
        str(Path(RESULTS_DIR) / f"{spec_id}.json"),
        {
            "specId": spec_id,
            "gradedAt": now,
            "vector": {v["id"]: v["status"] for v in vector},
        },
    )

    # Render + append to the plan's Progress Log.
    icon = {"PASS": "[PASS]", "FAIL": "[FAIL]", "MISSING": "[MISSING]", "INVALID": "[INVALID]"}
    lines = [f"- {v['id']}: {v['status']} {icon.get(v['status'], '')}".rstrip() for v in vector]
    block = "\n".join(["", f"### AC vector -- {spec_id} -- {now}", *lines, ""]) + "\n"
    with open(plan_path, "a", encoding="utf-8") as fh:
        fh.write(block)

    print(f"AC vector for {spec_id}:")
    for v in vector:
        print(f"  {v['id']}: {v['status']}")

    failing = [v for v in vector if v["status"] != "PASS"]
    if failing:
        print(
            f"\n[X] {len(failing)}/{len(vector)} AC(s) not PASS -- feature is not complete.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    print(f"\n[OK] all {len(vector)} AC(s) PASS.")


if __name__ == "__main__":
    main()
