#!/usr/bin/env python3
# scripts/mutation_report.py
#
# AC-7 post-processor. Reads mutmut's JUnit report and produces an overall mutation
# score checked against the floor (60% -- PLAN-003 falsifier #3). This is a NIGHTLY
# ALARM: it never fails a build. It writes .rigel/mutation/summary.json; the workflow
# reads `breach` from it to decide whether to open an issue.
#
# mutmut's JUnit output (`mutmut junitxml`) emits one <testcase> per mutant; a mutant
# that SURVIVED the acceptance suite is marked as a <failure>, a KILLED mutant has no
# failure. So: killed = testcases with no failure/error; valid = non-skipped testcases.
#
# DEVIATION FROM EXPRESS (Stryker): Stryker's JSON exposes `killedBy` test ids, so the
# express report attributes each killed mutant to the AC whose test killed it. mutmut's
# report has no per-test kill attribution, so `perAc` is left empty and only the overall
# score / floor breach is reported. This is sufficient for an alarm.

import os
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.rigel_evals import write_json  # noqa: E402

FLOOR = 60  # percent -- sustained breach opens an issue (see PLAN-003 falsifier #3)
REPORT = "reports/mutation/mutation.junit.xml"
SUMMARY = ".rigel/mutation/summary.json"


def main() -> None:
    if not os.path.exists(REPORT):
        print(f"mutation-report: no mutmut report at {REPORT} -- nothing to summarize (skipped).")
        write_json(SUMMARY, {"skipped": True, "reason": "no-report"})
        raise SystemExit(0)

    try:
        root = ET.parse(REPORT).getroot()
    except ET.ParseError as exc:
        print(f"mutation-report: could not parse {REPORT}: {exc} (skipped).")
        write_json(SUMMARY, {"skipped": True, "reason": "parse-error"})
        raise SystemExit(0) from exc

    valid = 0
    killed = 0
    for tc in root.iter("testcase"):
        if any(child.tag == "skipped" for child in tc):
            continue  # not a checked mutant
        valid += 1
        survived = any(child.tag in ("failure", "error") for child in tc)
        if not survived:
            killed += 1

    overall = 0.0 if valid == 0 else round(killed / valid * 1000) / 10
    breach = valid > 0 and overall < FLOOR

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "floor": FLOOR,
        "overallScore": overall,
        "killed": killed,
        "valid": valid,
        "breach": breach,
        "perAc": {},  # mutmut exposes no per-test kill attribution (see module docstring)
    }
    write_json(SUMMARY, summary)

    print(f"Mutation score: {overall}% ({killed}/{valid} mutants killed) -- floor {FLOOR}%")
    print(f"[!] FLOOR BREACH -- below {FLOOR}%" if breach else "[OK] above floor")
    # Exit 0 always -- this is an alarm, not a gate. The workflow reads summary.json.


if __name__ == "__main__":
    main()
