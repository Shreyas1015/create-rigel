#!/usr/bin/env bash
# Fires after every Write/Edit/MultiEdit tool call.
# Two severities:
#   BLOCKER (exit 2) — writing the holdout acceptance set (tests/acceptance/) outside the
#     spec phase. Checked for ANY file (not just .ts) before the source-file filters.
#   WARNINGS (exit 0) — advisory NestJS-specific lint (console.log, process.env, HttpException
#     in services, @InjectModel in services, unsafe repo casts, controller logic, size, DTOs).

set -euo pipefail

# Claude Code's PostToolUse payload nests the edited path at .tool_input.file_path;
# check that documented location first, then top-level fallbacks. (Reading only the
# top-level keys meant the hook never saw the path on real payloads.)
FILE=$(cat | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input') or {}
    print(ti.get('file_path') or ti.get('path') or data.get('file_path') or data.get('path') or '')
except:
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
# This runs BEFORE the "-f" and ".ts" early-exits below, so non-.ts writes under
# tests/acceptance/ (fixtures, JSON, snapshots) are caught too.
if [[ "$NORM" =~ (^|/)tests/acceptance/ ]]; then
  MARKER="${CLAUDE_PROJECT_DIR:-.}/.rigel/acceptance.unlock"
  if [[ ! -f "$MARKER" ]]; then
    BLOCKERS+=("🚫 [HOOK] $NORM is a HOLDOUT acceptance test — editable only during the spec phase (/write-spec). Revert this change. Acceptance tests encode the spec's success criteria and must not be altered while building.")
  fi
fi

# Flush blockers to stderr and fail (exit 2) before the source-file filters, so non-.ts
# holdout writes are caught too. Exit 2 tells Claude Code the change must be reverted.
if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
  for b in "${BLOCKERS[@]}"; do
    echo "$b" >&2
  done
  exit 2
fi

[[ ! -f "$FILE" ]] && exit 0
[[ ! "$FILE" =~ \.ts$ ]] && exit 0

WARNINGS=()

# 1. console.log — use Logger from @nestjs/common
if [[ "$FILE" =~ ^src/ ]]; then
  if grep -qn "console\.\(log\|error\|warn\|info\)" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "console\.\(log\|error\|warn\|info\)" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] console.log at $FILE:$LINE — use Logger from @nestjs/common or nestjs-pino")
  fi
fi

# 2. process.env — use ConfigService
if [[ "$FILE" =~ ^src/ ]] && [[ ! "$FILE" =~ src/config/ ]]; then
  if grep -qn "process\.env" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "process\.env" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] process.env at $FILE:$LINE — inject ConfigService instead")
  fi
fi

# 3. HttpException in service files — use NestJS semantic exceptions
if [[ "$FILE" =~ \.service\.ts$ ]]; then
  if grep -qn "throw new HttpException\b" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "throw new HttpException" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] HttpException in service at $FILE:$LINE — use NotFoundException, ConflictException etc.")
  fi
fi

# 4. @InjectModel in service files — inject repository instead
if [[ "$FILE" =~ \.service\.ts$ ]]; then
  if grep -qn "@InjectModel\b" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "@InjectModel" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] @InjectModel in service at $FILE:$LINE — inject the repository class, not the model directly")
  fi
fi

# 5. Raw .toJSON() without Zod parse in repository files
if [[ "$FILE" =~ \.repository\.ts$ ]]; then
  if grep -qn "\.toJSON()" "$FILE" 2>/dev/null; then
    # Check if .parse( is on the same or next line
    if ! grep -qn "Schema\.parse\|\.parse(" "$FILE" 2>/dev/null; then
      WARNINGS+=("⚠ [HOOK] .toJSON() without ZodSchema.parse() in $FILE — validate every DB result")
    fi
  fi
fi

# 6. Business logic in controller files (if/else, calculations)
if [[ "$FILE" =~ \.controller\.ts$ ]]; then
  if grep -qnE "^\s+(if|else|switch|for|while|const .* = .* \? )" "$FILE" 2>/dev/null; then
    LINE=$(grep -nE "^\s+(if|else|switch|for|while)" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] Possible business logic in controller at $FILE:$LINE — controllers should delegate to service only")
  fi
fi

# 7. File size > 400 lines
LINE_COUNT=$(wc -l < "$FILE" 2>/dev/null || echo 0)
if [[ $LINE_COUNT -gt 400 ]]; then
  WARNINGS+=("⚠ [HOOK] $FILE has $LINE_COUNT lines — exceeds 400-line limit. Split into focused modules.")
fi

# 8. Missing @ApiProperty in DTO files
if [[ "$FILE" =~ \.dto\.ts$ ]]; then
  PROP_COUNT=$(grep -c "^\s*\(readonly\s\+\)\?[a-zA-Z]" "$FILE" 2>/dev/null || echo 0)
  API_PROP_COUNT=$(grep -c "@ApiProperty" "$FILE" 2>/dev/null || echo 0)
  if [[ $PROP_COUNT -gt 0 ]] && [[ $API_PROP_COUNT -eq 0 ]]; then
    WARNINGS+=("⚠ [HOOK] DTO $FILE has properties without @ApiProperty() — Swagger will be incomplete")
  fi
fi

# Print all warnings (guard the empty array for bash 3.2 / set -u — an unguarded
# "${WARNINGS[@]}" expansion crashes on an empty array under `set -u`).
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
  for w in "${WARNINGS[@]}"; do
    echo "$w"
  done
fi

# Exit 0 — remaining severity is advisory; the holdout blocker above already exited 2.
exit 0
