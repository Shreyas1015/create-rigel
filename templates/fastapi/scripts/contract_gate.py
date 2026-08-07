#!/usr/bin/env python3
# scripts/contract_gate.py — PLAN-010. Don't silently break your consumers.
#
# Three checks, in the order that makes them meaningful:
#
#   1. FRESHNESS  — re-export the spec, fail if the committed one drifted.
#                   This comes FIRST and is always blocking: a stale spec makes every check below
#                   it, plus /api-sync and the service map, a lie.
#   2. BREAKING   — oasdiff against origin/main. Removing a response field, tightening a type,
#                   deleting an endpoint — all fail here unless you used an escape hatch.
#   3. EXEMPTIONS — every .oasdiff-ignore entry must carry a reason and an expiry, and an EXPIRED
#                   entry fails. A "temporary" exemption cannot quietly become permanent.
#
# Git history is the contract registry: `origin/main:openapi.json` is the previous version, for
# free. No broker, no registry, no cross-repo CI.
#
# Escape hatches, in the order you should reach for them (all native to oasdiff):
#   x-stability-level: draft   → the endpoint is exempt while it's still moving
#   deprecated + x-sunset      → expand-migrate-contract, enforced as an exit code
#   .oasdiff-ignore + expiry   → break glass, and it self-destructs
# Never a PR label: a skipped required check is a silently disabled gate.
#
# Mirrors templates/express/scripts/contract-gate.mjs 1:1 — same checks, same order, same exit
# codes. Pure stdlib so it runs with a bare `python3`: a leaf gate step must never itself be the
# reason the gate can't run.
#
# Usage: python3 scripts/contract_gate.py [--base origin/main]

import datetime
import re
import shutil
import subprocess
import sys
from pathlib import Path

SPEC = Path("openapi.json")
IGNORE = Path(".oasdiff-ignore")

FAILED = False
BREAKING_FOUND = False
AUTHORIZED = False
EXEMPTIONS_ROTTEN = False
SPECS_DIR = Path("docs/product-specs/ready")

# Line-buffer stdout. Failures go to stderr (unbuffered) and successes to stdout (block-buffered
# when piped, which `make gate` and CI always are) — so without this the ✗ lines all appear BEFORE
# the ✓ lines and the report reads in the wrong order. The order IS the message here: freshness is
# first because a stale spec makes everything under it meaningless.
sys.stdout.reconfigure(line_buffering=True)


def ok(m: str) -> None:
    print(f"  ✓ {m}")


def bad(m: str) -> None:
    global FAILED
    print(f"  ✗ {m}", file=sys.stderr)
    FAILED = True


def arg_for(flag: str) -> str | None:
    if flag in sys.argv:
        i = sys.argv.index(flag)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return None


def rev_exists(rev: str) -> bool:
    return subprocess.run(["git", "cat-file", "-e", rev], capture_output=True).returncode == 0


base = arg_for("--base") or "origin/main"

# ── 1. freshness — blocking, always ─────────────────────────────────────────────
if not SPEC.exists():
    print(f"  · no {SPEC} yet — run /infra-setup and add a route first")
    sys.exit(0)

before = SPEC.read_bytes()
# `make openapi` loads .env then dumps app.openapi() — the same command a human runs, so the gate
# can never disagree with the documented workflow.
export = subprocess.run(["make", "openapi"], capture_output=True, text=True)
if export.returncode != 0:
    bad("make openapi failed — cannot verify the contract is current\n" + (export.stderr or "").strip())
elif SPEC.read_bytes() != before:
    bad(f"{SPEC} is STALE — the code has moved. Re-run `make openapi` and commit it.")
    bad("  (everything below this validates the contract, so a stale one makes them meaningless)")
else:
    ok("contract is current (re-export produced no diff)")


def ci_enforces() -> bool:
    """Does any committed workflow actually install oasdiff? A fact, not a promise."""
    d = Path(".github/workflows")
    try:
        return any(
            f.suffix in (".yml", ".yaml") and "oasdiff" in f.read_text(encoding="utf-8")
            for f in d.iterdir()
        )
    except OSError:
        return False


def declared_breaking() -> bool | None:
    """The active spec's declared intent: True | False | None (no spec, or no declaration)."""
    spec_file = None
    try:
        plans = Path("docs/exec-plans/active")
        for pl in sorted(plans.iterdir()) if plans.is_dir() else []:
            m = re.search(r"SPEC-[\w-]+", pl.read_text(encoding="utf-8"))
            if not m:
                continue
            hit = next((f for f in sorted(SPECS_DIR.iterdir()) if f.name.startswith(m.group(0))), None)
            if hit:
                spec_file = hit
                break
        if spec_file is None and SPECS_DIR.is_dir():
            ready = [f for f in sorted(SPECS_DIR.iterdir()) if f.suffix == ".md"]
            if len(ready) == 1:
                spec_file = ready[0]
    except OSError:
        return None
    if spec_file is None or not spec_file.exists():
        return None
    m = re.search(r"^\s*breaking:\s*(true|false)\s*$", spec_file.read_text(encoding="utf-8"), re.M)
    return m.group(1) == "true" if m else None


# ── 3. exemptions expire (checked even if oasdiff is unavailable) ────────────────
if IGNORE.exists():
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    n = 0
    good = 0
    for raw in IGNORE.read_text(encoding="utf-8").split("\n"):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            # oasdiff has NO comment syntax — it matches EVERY line as a substring against its
            # error text. So a "#"-prefixed line that reads like an error message is a LIVE
            # exemption wearing a comment's clothes, silently suppressing that exact break. This
            # gate and oasdiff must never disagree about what a comment is.
            if re.search(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/", line):
                bad(
                    f'{IGNORE}: this "commented-out" line is STILL A LIVE RULE — oasdiff has no\n'
                    f"      comment syntax and matches every line as a substring. Delete it, or\n"
                    f"      make it a real exemption.\n      {line}"
                )
            continue
        n += 1
        exp = re.search(r"#\s*expires:\s*(\d{4}-\d{2}-\d{2})", raw)
        reason = re.search(r"#\s*reason:\s*\S", raw)
        if not exp:
            bad(f'{IGNORE}: entry has no "# expires: YYYY-MM-DD" — exemptions must self-destruct\n      {line}')
        elif exp.group(1) < today:
            bad(f"{IGNORE}: exemption EXPIRED on {exp.group(1)} — re-justify it or fix the contract\n      {line}")
        if not reason:
            bad(f'{IGNORE}: entry has no "# reason:" — an unexplained exemption is a rubber stamp\n      {line}')
        # PLAN-011 AC-4: naming who you are breaking it for IS the permission step. A person, not
        # a team — diffuse ownership is how exemptions rot. "consumers: none" is a valid claim.
        owner = re.search(r"#\s*owner:\s*\S", raw)
        consumers = re.search(r"#\s*consumers:\s*\S", raw)
        if not owner:
            bad(f'{IGNORE}: entry has no "# owner: @person" — someone must own this break\n      {line}')
        if not consumers:
            bad(
                f'{IGNORE}: entry has no "# consumers:" — name who this breaks (`create-rigel impact`\n'
                f'      lists them), or write "# consumers: none" to claim there are none\n      {line}'
            )
        if reason and owner and consumers and exp and exp.group(1) >= today:
            good += 1
    EXEMPTIONS_ROTTEN = n > good  # some entry is expired or missing a required annotation
    if good:
        ok(f"{good} contract exemption(s) present and unexpired")
    if n and not good:
        print(f"  · {n} exemption(s) present, none currently valid")

# ── 2. breaking changes ─────────────────────────────────────────────────────────
if shutil.which("oasdiff") is None:
    # Whether CI covers this is a FACT about the repo, so check it rather than assert it — this
    # template generates its own ci.yml and cannot promise the step is there. A check that
    # verifies nothing must say so (LSN-0004).
    print("  · oasdiff not installed — breaking changes were NOT CHECKED locally.")
    if ci_enforces():
        print("    CI installs it and will enforce this; to check before pushing:")
    else:
        bad("and NO workflow in .github/workflows installs oasdiff either — nothing is enforcing this.")
        print("      Add to your CI, before the contract gate (needs fetch-depth: 0):", file=sys.stderr)
        print('        curl -fsSL https://raw.githubusercontent.com/oasdiff/oasdiff/main/install.sh | sh -s -- -b "$RUNNER_TEMP/bin"', file=sys.stderr)
        print('        echo "$RUNNER_TEMP/bin" >> "$GITHUB_PATH"', file=sys.stderr)
        print("    To check locally:")
    print("      brew install oasdiff | go install github.com/oasdiff/oasdiff@latest")
elif not rev_exists(f"{base}:{SPEC}"):
    print(f"  · no {base}:{SPEC} to compare against (new spec, or shallow clone) — skipped")
else:
    # Run oasdiff TWICE: "did the contract break?" and "does the gate block?" are different
    # questions, and conflating them makes the gate lie. The raw run is the TRUTH; the ignored run
    # is ENFORCEMENT. Without this an exemption erases the break from the declaration cross-check
    # below, so `breaking: false` plus an exemption would pass — AC-4 defeating AC-3.
    def argv(ignore: bool) -> list[str]:
        a = ["oasdiff", "breaking", "--fail-on", "ERR", f"{base}:{SPEC}", str(SPEC)]
        if ignore:
            a += ["--err-ignore", str(IGNORE)]
        return a

    raw_run = subprocess.run(argv(False), capture_output=True, text=True)
    r = subprocess.run(argv(True), capture_output=True, text=True) if IGNORE.exists() else raw_run
    BREAKING_FOUND = raw_run.returncode == 1
    # oasdiff has no concept of expiry — it suppresses an expired rule just the same. So a
    # suppressed break is only AUTHORIZED if our own expiry/annotation check also passed.
    suppressed = raw_run.returncode == 1 and r.returncode == 0
    AUTHORIZED = suppressed and not EXEMPTIONS_ROTTEN

    # Verified severity boundary (oasdiff 1.28): ERR = endpoint removed, REQUIRED property removed,
    # required request param added, property type changed. WARN = OPTIONAL property removed.
    # We block on ERR — but a warning still matters to a consumer, so never swallow it.
    stdout = r.stdout or ""
    summary = next((line for line in stdout.split("\n") if re.search(r"\d+ changes:", line)), "")
    m = re.search(r"(\d+) warning", summary)
    warns = int(m.group(1)) if m else 0

    if r.returncode == 0:
        if suppressed and not AUTHORIZED:
            bad("breaking change(s) suppressed by an EXPIRED or incomplete exemption — NOT authorized:")
            print("\n".join(f"      {ln.strip()}" for ln in (raw_run.stdout or "").strip().split("\n")[:6]), file=sys.stderr)
        elif AUTHORIZED:
            # Say what actually happened. "No breaking changes" would be false — the break is real
            # and permitted, a different claim, and the difference is the whole audit trail.
            ok("breaking change(s) present but AUTHORIZED by an unexpired exemption:")
            print("\n".join(f"      {ln.strip()}" for ln in (raw_run.stdout or "").strip().split("\n")[:6]))
        else:
            ok("no breaking API changes")
        if warns > 0:
            print(f"  · {warns} non-blocking contract change(s) — a consumer may still care:")
            print("\n".join(f"      {ln.strip()}" for ln in stdout.strip().split("\n") if "warning" in ln))
    elif r.returncode == 1:
        BREAKING_FOUND = True
        bad("BREAKING API change — consumers of this contract would break:")
        body = (stdout or r.stderr or "").strip()
        print("\n".join(f"      {ln}" for ln in body.split("\n")), file=sys.stderr)
        print(
            f"""
    Ship it deliberately, in this order of preference:
      1. mark the endpoint  x-stability-level: draft   (still moving; exempt)
      2. deprecated: true + x-sunset: <date>           (migrate, then remove after the date)
      3. a line in {IGNORE} with  # reason:  and  # expires:   (break glass; it self-destructs)
    Never a PR label — a skipped required check is a silently disabled gate.""",
            file=sys.stderr,
        )
    else:
        # 100/101/102 = oasdiff itself failed. A spec that won't parse is not "a breaking change".
        bad(f"oasdiff could not run (exit {r.returncode}) — this is a TOOL failure, not a breaking change")
        print("      " + " ".join((r.stderr or "").strip().split("\n")[-2:]), file=sys.stderr)


# ── 4. did the spec DECLARE this break? (PLAN-011 AC-3) ─────────────────────────
# At spec time the code doesn't exist, so nothing can be predicted — but the author can DECLARE
# intent, and HERE, where the diff is real, we check whether reality matched the claim.
# Asymmetric on purpose: over-declaring is free, under-declaring fails. Caution costs nothing.
_declared = declared_breaking()
if _declared is None:
    print("  · no active spec with an impact declaration — nothing to cross-check")
elif BREAKING_FOUND and _declared is False:
    bad(
        "UNDECLARED BREAK — the spec says `breaking: false`, but the contract broke"
        + (" (an exemption permits it, but the spec never claimed it)." if AUTHORIZED else ".")
    )
    print(
        f"""
    Either the change is wrong, or the declaration is. Fix one:
      • revert the breaking part, or
      • set  breaking: true  in the spec's impact block, name the affected consumers
        (`create-rigel impact` lists them), and add an authorized exemption to {IGNORE}.""",
        file=sys.stderr,
    )
elif BREAKING_FOUND and _declared is True and AUTHORIZED:
    ok("declared `breaking: true`, and the break is authorized — reality matches the claim")
elif BREAKING_FOUND and _declared is True:
    # Declaring is not authorizing. The declaration says you MEANT to; the exemption says who you
    # are breaking it for and by when. Both, or neither.
    bad("declared `breaking: true` — but it is not AUTHORIZED yet")
    print(
        f"""
    Add an exemption to {IGNORE} naming who this breaks and until when:
      <the oasdiff error text above>   # reason: <why>  # owner: @you
        # expires: YYYY-MM-DD  # consumers: <from `create-rigel impact`>
    An expired exemption fails again, so this cannot quietly become permanent.""",
        file=sys.stderr,
    )
elif not BREAKING_FOUND and _declared is True:
    print("  · spec declared `breaking: true` but nothing broke — over-declaring is fine")
else:
    ok("no break, and none declared")

sys.exit(1 if FAILED else 0)
