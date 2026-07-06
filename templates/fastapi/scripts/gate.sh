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
fail() { printf '%b\n' "❌ $1"; FAIL=1; }   # %b so embedded \n render as newlines
pass() { printf '%b\n' "✓ $1"; }

if [[ ! -d src ]]; then
  echo "No src/ yet — run /infra-setup first. Nothing to gate."
  exit 0
fi

# 1. File size — no file > 400 lines
BIG=$(find src/ -name "*.py" -print0 | xargs -0 wc -l 2>/dev/null | awk '$1 > 400 && $2 != "total" { print $2" ("$1" lines)" }')
[[ -n "$BIG" ]] && fail "files over 400 lines:\n$BIG" || pass "no file > 400 lines"

# 2. print() in src/ (except logger.py and config/)
PRINTS=$(grep -rn "^\s*print(" src/ --include="*.py" 2>/dev/null | grep -v "src/providers/logger" | grep -v "src/config/")
[[ -n "$PRINTS" ]] && fail "print() in src/:\n$PRINTS" || pass "no print() in src/"

# 3. os.environ outside settings.py
ENVS=$(grep -rn "os\.environ" src/ --include="*.py" 2>/dev/null | grep -v "src/config/settings.py")
[[ -n "$ENVS" ]] && fail "os.environ outside settings.py:\n$ENVS" || pass "no os.environ outside settings.py"

# 4. HTTPException raised in a service
SVC_HTTP=$(grep -rn "HTTPException" src/services/ --include="*.py" 2>/dev/null)
[[ -n "$SVC_HTTP" ]] && fail "HTTPException in service layer:\n$SVC_HTTP" || pass "no HTTPException in services"

# 5. Services must not import fastapi or ORM models
SVC_IMP=$(grep -rn "from fastapi\|import fastapi\|from src.models\|import src.models" src/services/ --include="*.py" 2>/dev/null)
[[ -n "$SVC_IMP" ]] && fail "service imports fastapi/models:\n$SVC_IMP" || pass "services free of fastapi/models imports"

# 6. Unvalidated raw dict / ORM returns in repo
RAW=$(grep -rn "return row\.__dict__\|return dict(row\|return rows\b" src/repo/ --include="*.py" 2>/dev/null)
[[ -n "$RAW" ]] && fail "unvalidated returns in repo (use Schema.model_validate):\n$RAW" || pass "repo returns validated"

# 7. Offset pagination in repo
OFFSET=$(grep -rn "\.offset(" src/repo/ --include="*.py" 2>/dev/null)
[[ -n "$OFFSET" ]] && fail "offset pagination in repo (use cursor):\n$OFFSET" || pass "no offset pagination"

# 8. ruff
echo "── ruff ──"; uv run ruff check src/ || FAIL=1

# 9. mypy
echo "── mypy ──"; uv run mypy src/ || FAIL=1

# 10. bandit (full security scan)
echo "── bandit ──"; uv run bandit -r src/ -ll -q || FAIL=1

# 11. architecture structural tests
if [[ -d tests/architecture ]]; then
  echo "── architecture tests ──"; uv run pytest tests/architecture/ -q || FAIL=1
fi

echo "─────────────────────────────"
if [[ $FAIL -ne 0 ]]; then
  echo "GATE: ❌ FAIL"
  exit 1
fi
echo "GATE: ✅ PASS"
