#!/usr/bin/env bash
# scripts/gate.sh — deterministic, runnable mirror of the gate-checker agent's
# universal checks. Humans run `make gate`; pre-commit runs this; the agent runs
# the same logic. Exits non-zero on any violation so it can block commits/CI.
#
# Layer-specific coverage thresholds (utils 100 / services 90 / repo 80 /
# runtime 75 / providers 70) are enforced by the gate-checker agent and CI;
# this script enforces the universal, always-on invariants.

set -uo pipefail

FAIL=0
# PLAN-024 AC-4: every failing step is RECORDED, so /curate has something to learn from. The gate
# used to only print — a failure fixed at the terminal was forgotten, and an audited repo reached 17
# shipped plans with zero lessons. One record per step per commit (record_failure.py dedupes).
record() {
  python3 scripts/record_failure.py "gate:$1" "${2:-step failed}" >/dev/null 2>&1 \
    || echo "  (could not record gate:$1 — the gate's verdict is unchanged)"
}
fail() { printf '%b\n' "❌ $1"; FAIL=1; [[ -n "${2:-}" ]] && record "$2" "$(printf '%b' "$1" | head -1)"; }   # %b so embedded \n render as newlines
failed() { FAIL=1; record "$1"; }
pass() { printf '%b\n' "✓ $1"; }

# 0. Rigel manifest — has anyone edited a file Rigel owns? Runs BEFORE the no-src early exit:
# the manifest exists from scaffold time, and a tampered harness invalidates every check below it.
if [[ -f .rigel/manifest.json ]]; then
  if python3 scripts/rigel_verify.py; then :; else fail "rigel verify failed (see above)" rigel-manifest; fi
else
  echo "· no .rigel/manifest.json — skipping rigel verify"
fi

if [[ ! -d src ]]; then
  echo "No src/ yet — run /infra-setup first. Nothing else to gate."
  [[ $FAIL -ne 0 ]] && exit 1
  exit 0
fi

# 1. File size — no file > 400 lines
BIG=$(find src/ -name "*.py" -print0 | xargs -0 wc -l 2>/dev/null | awk '$1 > 400 && $2 != "total" { print $2" ("$1" lines)" }')
[[ -n "$BIG" ]] && fail "files over 400 lines:\n$BIG" file-size || pass "no file > 400 lines"

# 2. print() in src/ (except logger.py and config/)
PRINTS=$(grep -rn "^\s*print(" src/ --include="*.py" 2>/dev/null | grep -v "src/providers/logger" | grep -v "src/config/")
[[ -n "$PRINTS" ]] && fail "print() in src/:\n$PRINTS" print-in-src || pass "no print() in src/"

# 3. os.environ outside settings.py
ENVS=$(grep -rn "os\.environ" src/ --include="*.py" 2>/dev/null | grep -v "src/config/settings.py")
[[ -n "$ENVS" ]] && fail "os.environ outside settings.py:\n$ENVS" os-environ-outside-settings-py || pass "no os.environ outside settings.py"

# 4. HTTPException raised in a service
SVC_HTTP=$(grep -rn "HTTPException" src/services/ --include="*.py" 2>/dev/null)
[[ -n "$SVC_HTTP" ]] && fail "HTTPException in service layer:\n$SVC_HTTP" httpexception-raised-in-a-service || pass "no HTTPException in services"

# 5. Services must not import fastapi or ORM models
SVC_IMP=$(grep -rn "from fastapi\|import fastapi\|from src.models\|import src.models" src/services/ --include="*.py" 2>/dev/null)
[[ -n "$SVC_IMP" ]] && fail "service imports fastapi/models:\n$SVC_IMP" services-must-not-import-fastapi-or-orm-models || pass "services free of fastapi/models imports"

# 6. Unvalidated raw dict / ORM returns in repo
RAW=$(grep -rn "return row\.__dict__\|return dict(row\|return rows\b" src/repo/ --include="*.py" 2>/dev/null)
[[ -n "$RAW" ]] && fail "unvalidated returns in repo (use Schema.model_validate):\n$RAW" unvalidated-raw-dict-orm-returns-in-repo || pass "repo returns validated"

# 7. Offset pagination in repo
OFFSET=$(grep -rn "\.offset(" src/repo/ --include="*.py" 2>/dev/null)
[[ -n "$OFFSET" ]] && fail "offset pagination in repo (use cursor):\n$OFFSET" offset-pagination-in-repo || pass "no offset pagination"

# 8. ruff
echo "── ruff ──"; uv run ruff check src/ || failed ruff

# 9. mypy
echo "── mypy ──"; uv run mypy src/ || failed mypy

# 10. bandit (full security scan)
echo "── bandit ──"; uv run bandit -r src/ -ll -q || failed bandit

# 11. architecture structural tests
if [[ -d tests/architecture ]]; then
  echo "── architecture tests ──"; uv run pytest tests/architecture/ -q || failed architecture-tests
fi

# 12. zero-tests guard (PLAN-006 AC-1) — a runner that collects 0 tests must FAIL LOUDLY,
# never be indistinguishable from a pass. pytest exit code 5 = NO_TESTS_COLLECTED.
echo "── zero-tests guard ──"
rc=0
uv run pytest tests/ --collect-only -q >/dev/null 2>&1 || rc=$?
if [[ $rc -eq 5 ]]; then
  echo "🚫 zero-tests guard: pytest collected 0 tests (exit 5). A runner that finds nothing is NOT a pass."; failed zero-tests-guard
elif [[ $rc -ne 0 ]]; then
  echo "🚫 zero-tests guard: pytest collection errored (exit $rc) — failing rather than assuming success."; failed zero-tests-guard
fi

# 13. company knowledge (PLAN-009/011) — do the terms in knowledge/domain/ still name real code?
# BLOCKING: a wiki rots in silence, anchored knowledge rots loudly, and prose that cannot fail a
# build is just a doc. Pure python3 + stdlib ON PURPOSE — the JS stacks import the stamped
# rigel-knowledge-lib.mjs, but `command -v node || skip` in a BLOCKING step is a false green on
# every machine without node (LSN-0004). A term may declare `owner:` so only that service is held
# to its anchors; this repo's identity is its directory name, the same one `create-rigel facts`
# uses. `--advisory` downgrades it to a report for a migration window.
echo "── knowledge anchors ──"
python3 scripts/rigel_knowledge.py || failed knowledge-anchors

# 14. contract gate (PLAN-010) — this service PUBLISHES an OpenAPI contract, so it owes its
# consumers three things: the committed openapi.json is CURRENT (re-export + compare), no BREAKING
# change vs origin/main (oasdiff; git history is the contract registry), and every .oasdiff-ignore
# exemption carries a reason + an unexpired expiry. LAST because it is the only step that shells
# out to another binary — it skips the oasdiff half with a notice when oasdiff is absent.
# 13b. regression tests for recurring failures (PLAN-012) — a signature that has failed twice is
# a /debug case, and a /debug case that ends without a regression test will come back.
# 13a. MCP declarations (PLAN-015) — a declared server that cannot start provides no tools and
# reports no error, so the agent silently loses a capability it was told it had.
echo "── mcp declarations ──"
node scripts/check-mcp.mjs || failed mcp-declarations

# Swallowed errors in src/ — `except: pass` is a check that verifies nothing (LSN-0004).
echo "── silent failures ──"
node scripts/check-silent-failures.mjs || failed silent-failures

# Design decisions the spec owes — derived from its endpoints and entities.
echo "── design decisions ──"
node scripts/check-design.mjs || failed design-decisions

echo "── debug regressions ──"
python3 scripts/debug_regression.py check || failed debug-regressions

echo "── contract gate ──"
python3 scripts/contract_gate.py || failed contract-gate

echo "─────────────────────────────"
if [[ $FAIL -ne 0 ]]; then
  echo "GATE: ❌ FAIL"
  exit 1
fi
echo "GATE: ✅ PASS"
