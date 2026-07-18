#!/usr/bin/env bash
# .claude/hooks/post-write.sh
# Fires after every Write/Edit tool call.
#
# Two severities:
#   BLOCKERS (exit 2) — the agent MUST revert before continuing. Currently: editing
#     the holdout acceptance-test set (tests/acceptance/) outside the spec phase.
#   WARNINGS (exit 0) — advisory: print(), os.environ, 400-line limit, raw dict cast
#     on DB results, HTTPException in services. The gate-checker does the hard blocking.
#
# Exit-code contract (Claude Code PostToolUse): a non-zero exit (2) with text on stderr
# is fed back to the agent as a required fix. Exit 0 with text on stdout is advisory.

set -euo pipefail

FILE=$(cat | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input') or {}
    print(ti.get('file_path') or ti.get('path') or data.get('file_path') or data.get('path') or '')
except Exception:
    print('')
" 2>/dev/null || echo "")

[[ -z "$FILE" ]] && exit 0

# Normalise backslashes → forward slashes for portable path matching.
NORM="${FILE//\\//}"

BLOCKERS=()

# ── BLOCKER: tests/acceptance/ is a HOLDOUT — writable ONLY during the spec phase ──
# /write-spec drops .rigel/acceptance.unlock while it scaffolds the failing acceptance
# tests, then removes it. A write here without that marker is a build-phase edit to the
# holdout set (test tampering) and must be reverted. Fail-closed: no marker → blocked.
# Runs for ANY file under tests/acceptance/ (not just .py) and BEFORE the .py filter.
if [[ "$NORM" =~ (^|/)tests/acceptance/ ]]; then
  MARKER="${CLAUDE_PROJECT_DIR:-.}/.rigel/acceptance.unlock"
  if [[ ! -f "$MARKER" ]]; then
    BLOCKERS+=("[HOOK] $NORM is a HOLDOUT acceptance test — editable only during the spec phase (/write-spec). Revert this change. Acceptance tests encode the spec's success criteria and must not be altered while building.")
  fi
fi

# Flush blockers to stderr and fail before the source-file filter, so non-.py holdout
# writes are caught too.
if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
  for b in "${BLOCKERS[@]}"; do
    echo "$b" >&2
  done
  exit 2
fi

[[ ! -f "$FILE" ]] && exit 0
[[ ! "$FILE" =~ \.py$ ]] && exit 0

WARNINGS=()

# 1. print() in src/ — use structlog logger
if [[ "$FILE" =~ ^src/ ]] && [[ ! "$FILE" =~ src/providers/logger ]] && [[ ! "$FILE" =~ src/config/ ]]; then
  if grep -qn "^\s*print(" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "^\s*print(" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] print() at $FILE:$LINE — use logger from src/providers/logger.py")
  fi
fi

# 2. os.environ outside config/settings.py
if [[ "$FILE" =~ ^src/ ]] && [[ ! "$FILE" =~ src/config/settings\.py ]]; then
  if grep -qn "os\.environ" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "os\.environ" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] os.environ at $FILE:$LINE — use settings from src/config/settings.py")
  fi
fi

# 3. File size > 400 lines
LINE_COUNT=$(wc -l < "$FILE" 2>/dev/null || echo 0)
if [[ $LINE_COUNT -gt 400 ]]; then
  WARNINGS+=("⚠ [HOOK] $FILE has $LINE_COUNT lines — exceeds 400-line limit. Split into focused modules.")
fi

# 4. Unsafe DB result cast in repo files
if [[ "$FILE" =~ _repo\.py$ ]]; then
  if grep -qn "return row\.__dict__\b\|return dict(row" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "return row\.__dict__\|return dict(row" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] Unsafe cast at $FILE:$LINE — use Schema.model_validate(row.__dict__)")
  fi
fi

# 5. HTTPException in service files
if [[ "$FILE" =~ _service\.py$ ]]; then
  if grep -qn "HTTPException\|raise HTTPException" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "HTTPException" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] HTTPException at $FILE:$LINE — services must raise DomainError, not HTTPException")
  fi
fi

# Print all warnings (guard empty array for bash 3.2 / set -u).
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  for w in "${WARNINGS[@]}"; do
    echo "$w"
  done
fi

# Exit 0 — remaining severity is advisory; the holdout blocker above already exited 2.
exit 0
