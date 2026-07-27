#!/usr/bin/env python3
# scripts/verify_promotion.py — the promotion safety gate (PLAN-007 AC-5).
#
# Roadmap Phase 3 says: "no lesson promotes unless the golden-set score goes up." That gate needs
# accumulated golden-trial data, which does not exist yet (the golden nightly is unscheduled). So
# this implements the LOCAL equivalent, which is available today and is the same discipline:
#
#   A promoted rule must (1) NOT break the working build  — no false positives, and
#                        (2) ACTUALLY catch the failure    — no decorative enforcement.
#
# (1) is mechanical: run the gate. (2) cannot be automated generically — the way you plant a
# violation differs per rule — so it is an explicit human attestation via --tamper-verified.
# Without that flag this EXITS NON-ZERO: the gate fails closed rather than rubber-stamping.
#
# Pure stdlib so it runs with a bare `python3` (no uv/venv) — the promotion gate must never be
# blocked by the environment it is checking. Behaviour mirrors
# templates/express/scripts/verify-promotion.mjs 1:1.
#
# Usage:
#   python3 scripts/verify_promotion.py LSN-0031                      # checks (1), demands (2)
#   python3 scripts/verify_promotion.py LSN-0031 --tamper-verified    # attests (2) was done
#   python3 scripts/verify_promotion.py LSN-0031 --gate "make gate"

import re
import subprocess
import sys
from pathlib import Path

LESSONS = "docs/design-docs/lessons"

args = sys.argv[1:]
lesson_id = next((a for a in args if re.fullmatch(r"LSN-\d+", a, re.I)), None)
tamper_verified = "--tamper-verified" in args
gate_cmd = args[args.index("--gate") + 1] if "--gate" in args and len(args) > args.index("--gate") + 1 else "make gate"

if not lesson_id:
    print(
        'usage: verify_promotion.py <LSN-XXXX> [--tamper-verified] [--gate "<cmd>"]',
        file=sys.stderr,
    )
    raise SystemExit(2)

directory = Path(LESSONS)
file = None
if directory.exists():
    file = next(
        (p.name for p in sorted(directory.iterdir()) if p.name.upper().startswith(lesson_id.upper())),
        None,
    )
if not file:
    print(f"✗ no lesson file for {lesson_id} in {LESSONS}/", file=sys.stderr)
    raise SystemExit(1)

text = (directory / file).read_text(encoding="utf-8")
parts = text.split("---")
fm = parts[1] if len(parts) > 1 else ""


def get(k: str) -> str | None:
    m = re.search(rf"^{k}:\s*(.+)$", fm, re.M)
    return m.group(1).strip() if m else None


status = get("status")
enforced_by = re.sub(r"""^["']|["']$""", "", get("enforced_by") or "null")

print(f"Promotion check — {lesson_id} ({file})")
failed = False


def check(ok: bool, msg: str) -> None:
    global failed
    print(f"  {'✓' if ok else '✗'} {msg}")
    if not ok:
        failed = True


# -- lesson state --------------------------------------------------------------
check(
    status in ("DISTILLED", "ENFORCED"),
    f"status is {status} (must be DISTILLED to promote, or ENFORCED when re-verifying)",
)
check(enforced_by not in ("null", ""), f"enforced_by names the actual check: {enforced_by}")
if status == "ENFORCED":
    body = "---".join(parts[2:]).strip()
    check(
        not re.search(r"^##\s", body, re.M),
        "prose body deleted (an ENFORCED lesson keeps only frontmatter — the check carries the why)",
    )

# -- (1) the rule must not break the working build -----------------------------
sys.stdout.write(f"  … running gate: {gate_cmd}\n")
# shell=True mirrors the JS execSync default: --gate takes a shell command line.
gate = subprocess.run(gate_cmd, shell=True, capture_output=True)  # noqa: S602
if gate.returncode == 0:
    check(True, "gate PASSES with the new enforcement (no false positives on clean code)")
else:
    check(False, "gate FAILS with the new enforcement — it rejects code that should pass. Fix the rule, not the code.")

# -- (2) the rule must actually catch the failure ------------------------------
if tamper_verified:
    check(True, "tamper test attested: a planted violation was confirmed blocked")
else:
    print("  ✗ tamper test NOT attested")
    print("")
    print("    Required before promoting — prove the check is not decorative:")
    print("      1. Plant a violation the lesson describes (one file, smallest possible).")
    print("      2. Run the check. It MUST fail/block (non-zero, or a BLOCKER on the hook).")
    print("      3. Revert the plant.")
    print("      4. Re-run with --tamper-verified.")
    print("")
    print("    Every enforcement mechanism ships with a test that tries to defeat it.")
    failed = True

print("")
if failed:
    sys.stdout.flush()  # keep stdout/stderr interleaving identical to the JS twin when merged
    print(f"✗ {lesson_id} is NOT cleared for promotion.", file=sys.stderr)
    raise SystemExit(1)
print(f"✓ {lesson_id} cleared: set status: ENFORCED, keep enforced_by, delete the prose body.")
