#!/usr/bin/env python3
# scripts/debug_regression.py — a /debug session must end in a regression test, mechanically.
#
# WHY THIS EXISTS. /debug already forbids guessing, but its output was a fixed bug and a written
# record — nothing stopped the same bug returning. A fix without a test is a fix with a shelf life.
# Prose in the skill cannot enforce that ("if it can't fail a build, it's a doc"), so this does.
#
# THE RULE, and why it is scoped this narrowly:
#   A failure signature that has recurred (seen >= 2 times in .rigel/gate-failures.jsonl) must
#   have a regression test proven red-then-green.
# Recurrence is exactly when /debug fires, so the gate asks for a test precisely when a human
# would. A FIRST failure needs nothing — demanding a test for every transient gate failure would be
# noise, and a check that cries wolf gets switched off, taking the working checks with it.
#
# RED BEFORE GREEN, for the same reason redgreen_record.py exists: a test written after the fix has
# never been observed failing, so it may assert nothing at all. `red` REJECTS a test that already
# passes. That ordering is the whole proof.
#
# Mirrors templates/express/scripts/debug-regression.mjs 1:1 — same rule, same messages, same exit
# codes. Pure stdlib so it runs with a bare python3.
#
# Usage:
#   python3 scripts/debug_regression.py red   <signature> --test <path>   # before the fix; must FAIL
#   python3 scripts/debug_regression.py green <signature>                 # after the fix; must PASS
#   python3 scripts/debug_regression.py check                             # the gate step

import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

DIR = Path(".rigel/regressions")
FAILURES = Path(".rigel/gate-failures.jsonl")
THRESHOLD = 2  # == /debug's trigger: the SAME signature failing twice


def die(msg: str) -> None:
    print(f"❌ debug-regression: {msg}", file=sys.stderr)
    sys.exit(1)


def slug(sig: str) -> str:
    """A signature is `gate:discriminator`; ':' and '/' are not filename-safe."""
    return re.sub(r"[^\w.-]+", "-", sig)


def rec_path(sig: str) -> Path:
    return DIR / f"{slug(sig)}.json"


def git_head() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        return None


def run_test(path: str) -> bool:
    """
    Run ONE test file and report whether it PASSED.

    pytest's exit codes separate the cases the exit code alone cannot separate in jest:
      0 = all passed   1 = a test genuinely failed   2 = collection error (syntax/import)
      5 = no tests collected
    Only 1 is a real reproduction. Treating 2 or 5 as "red" would accept a file of gibberish, or an
    empty one, as proof that a bug reproduces — a check that verifies nothing (LSN-0004).
    """
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", path], capture_output=True, text=True)
    if r.returncode == 2:
        tail = (r.stdout or r.stderr or "").strip().split("\n")[-1:]
        die(
            f"{path} did not RUN — the suite failed to collect (syntax error, bad import, "
            f"missing module).\n      That is not a reproduction of the bug. Fix the test file "
            f"first.\n      {' '.join(tail)}"
        )
    if r.returncode == 5:
        die(
            f"{path} contains ZERO tests — an empty file cannot reproduce anything "
            f"(LSN-0004: a check that verifies nothing must fail loud)"
        )
    if r.returncode not in (0, 1):
        die(f"pytest could not run {path} (exit {r.returncode}) — a TOOL failure, not a test result")
    return r.returncode == 0


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def seen_counts() -> dict[str, int]:
    """signature -> times seen, from the append-only failure log."""
    if not FAILURES.exists():
        return {}
    counts: dict[str, int] = {}
    for line in FAILURES.read_text(encoding="utf-8").split("\n"):
        if not line.strip():
            continue
        try:
            sig = json.loads(line).get("signature")
        except json.JSONDecodeError:
            continue  # a malformed line is not a reason to stop counting the rest
        if sig:
            counts[sig] = counts.get(sig, 0) + 1
    return counts


argv = sys.argv[1:]
mode = argv[0] if argv else "check"
sig = argv[1] if len(argv) > 1 else None
now = datetime.datetime.now(datetime.timezone.utc).isoformat()

if mode == "red":
    if not sig:
        die("usage: debug_regression.py red <signature> --test <path>")
    test = argv[argv.index("--test") + 1] if "--test" in argv else None
    if not test:
        die("--test <path> is required — the regression test must exist BEFORE the fix")
    if not Path(test).exists():
        die(f"no such test file: {test}")
    if run_test(test):
        die(
            f"{test} PASSES already, so it does not reproduce {sig}.\n"
            f"      A test written after the fix proves nothing — it may assert nothing at all.\n"
            f"      Write the test so it FAILS on the current bug, then record red."
        )
    write_json(rec_path(sig), {"signature": sig, "test": test, "red": {"commit": git_head(), "ts": now}, "green": None})
    print(f"✓ red recorded: {test} reproduces {sig}")
    sys.exit(0)

if mode == "green":
    if not sig:
        die("usage: debug_regression.py green <signature>")
    p = rec_path(sig)
    if not p.exists():
        die(f"no red proof for {sig} — run `red` BEFORE the fix, or the test proves nothing")
    rec = json.loads(p.read_text(encoding="utf-8"))
    if not Path(rec["test"]).exists():
        die(f"the recorded test is gone: {rec['test']}")
    if not run_test(rec["test"]):
        die(f"{rec['test']} still FAILS — the bug is not fixed yet")
    rec["green"] = {"commit": git_head(), "ts": now}
    write_json(p, rec)
    print(f"✓ green recorded: {rec['test']} now passes — {sig} cannot return silently")
    sys.exit(0)

if mode == "check":
    recurring = [(s, n) for s, n in seen_counts().items() if n >= THRESHOLD]
    if not recurring:
        print("  ✓ no recurring failure signatures — no regression test owed")
        sys.exit(0)
    bad = 0
    for s, n in recurring:
        p = rec_path(s)
        rec = json.loads(p.read_text(encoding="utf-8")) if p.exists() else None
        if not rec or not rec.get("green"):
            bad += 1
            print(f"  ✗ {s} has failed {n}× but has no regression test proven red→green", file=sys.stderr)
            print(
                f"      A recurring bug with no test WILL come back. Write a test that reproduces "
                f"it, then:\n"
                f"        python3 scripts/debug_regression.py red   {s} --test <path>   # before the fix\n"
                f"        python3 scripts/debug_regression.py green {s}                 # after the fix",
                file=sys.stderr,
            )
        elif not Path(rec["test"]).exists():
            bad += 1
            print(f"  ✗ {s}: its regression test {rec['test']} has been DELETED", file=sys.stderr)
    if bad:
        sys.exit(1)
    print(f"  ✓ {len(recurring)} recurring signature(s), each pinned by a regression test")
    sys.exit(0)

die(f'unknown mode "{mode}" — expected red | green | check')
