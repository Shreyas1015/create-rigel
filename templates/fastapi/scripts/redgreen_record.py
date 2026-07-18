#!/usr/bin/env python3
# scripts/redgreen_record.py
#
# AC-4 (red-green proof). Run ONCE, right after /write-spec scaffolds a spec's
# acceptance tests and BEFORE any implementation exists. It runs those tests and
# requires every one to FAIL -- proving each test actually tests something (a test
# that already passes against the empty tree proves nothing and is rejected).
#
# It records .rigel/redgreen/SPEC-XXX.json (AC-ID -> {status:"red", commit}). The
# ac-vector gate later marks any AC lacking a recorded red state as INVALID, so a
# test can never claim its AC without having first been proven red.
#
# Usage:  uv run python scripts/redgreen_record.py [SPEC-XXX]
#   With no arg it resolves the spec from the active plan.

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.rigel_evals import (  # noqa: E402
    ACCEPTANCE_DIR,
    REDGREEN_DIR,
    ac_ids_with_tests,
    find_spec_file,
    git_head,
    parse_acceptance_criteria,
    resolve_active_spec,
    run_acceptance_tests,
    write_json,
)


def fail(msg: str) -> None:
    print(f"[X] redgreen_record: {msg}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    spec_id = sys.argv[1] if len(sys.argv) > 1 else None
    if spec_id:
        spec_file = find_spec_file(spec_id)
        if not spec_file:
            fail(f"no READY spec file found for {spec_id}")
        acs = parse_acceptance_criteria(Path(spec_file).read_text(encoding="utf-8"))
    else:
        resolved = resolve_active_spec()
        if not resolved:
            fail("no active plan/spec to record -- pass a SPEC-XXX id explicitly")
        spec_id = resolved["spec_id"]
        acs = resolved["acs"]

    if not acs:
        fail(f"{spec_id} has no AC-IDs in its Acceptance Criteria section")

    directory = Path(ACCEPTANCE_DIR) / spec_id
    if not directory.exists():
        fail(f"no acceptance tests found at {directory} -- /write-spec must scaffold them first")

    # Every AC must have a test carrying its AC-ID.
    with_tests = ac_ids_with_tests(spec_id)
    missing = [ac["id"] for ac in acs if ac["id"] not in with_tests]
    if missing:
        fail(f"these ACs have no acceptance test carrying their AC-ID: {', '.join(missing)}")

    print(f"> Running {spec_id} acceptance tests against the pre-implementation tree...")
    results = run_acceptance_tests(spec_id)

    passed_early = [ac["id"] for ac in acs if results.get(ac["id"]) == "passed"]
    if passed_early:
        fail(
            "these acceptance tests PASS before any implementation -- they prove nothing "
            "and must be rewritten to assert real behavior: " + ", ".join(passed_early)
        )

    commit = git_head()
    record = {
        "specId": spec_id,
        "recordedCommit": commit,
        "tests": {ac["id"]: {"status": "red", "commit": commit} for ac in acs},
    }
    out = str(Path(REDGREEN_DIR) / f"{spec_id}.json")
    write_json(out, record)
    print(
        f"[OK] red-green recorded: all {len(acs)} acceptance tests fail "
        f"pre-implementation -> {out}"
    )


if __name__ == "__main__":
    main()
