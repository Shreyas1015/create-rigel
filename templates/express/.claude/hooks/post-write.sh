#!/usr/bin/env bash
# .claude/hooks/post-write.sh
# Fires after every Write/Edit/MultiEdit tool call.
# Claude Code passes the tool invocation as JSON on stdin; the edited file
# path lives at .tool_input.file_path.
#
# Two severities:
#   BLOCKERS (exit 2) — the agent MUST revert before continuing. Currently: editing
#     the holdout acceptance-test set (tests/acceptance/) outside the spec phase.
#   WARNINGS (exit 0) — advisory: console.log, process.env outside config, file size,
#     unsafe casts. The gate-checker does the rest of the hard blocking.
#
# Exit-code contract (Claude Code PostToolUse): a non-zero exit (2) with text on stderr
# is fed back to the agent as a required fix. Exit 0 with text on stdout is advisory.

set -euo pipefail

# Read all of stdin once (the JSON tool payload).
PAYLOAD=$(cat)

# Resolve the file path. Prefer the env var Claude Code may expose, else parse
# the JSON payload with node (always present in this project). We check the
# documented nested path first (.tool_input.file_path), then top-level fallbacks.
FILE="${CLAUDE_FILE_PATH:-}"

if [[ -z "$FILE" ]]; then
  FILE=$(printf '%s' "$PAYLOAD" | node -e "
    let raw = '';
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => {
      try {
        const d = JSON.parse(raw);
        const p =
          (d.tool_input && (d.tool_input.file_path || d.tool_input.path)) ||
          d.file_path ||
          d.path ||
          '';
        process.stdout.write(String(p));
      } catch {
        process.stdout.write('');
      }
    });
  " 2>/dev/null || echo "")
fi

# Nothing to check
[[ -z "$FILE" ]] && exit 0

# Normalise backslashes → forward slashes for portable path matching.
NORM="${FILE//\\//}"

BLOCKERS=()

# ── BLOCKER: tests/acceptance/ is a HOLDOUT — writable ONLY during the spec phase ──
# /write-spec drops .rigel/acceptance.unlock while it scaffolds the failing acceptance
# tests, then removes it. A write here without that marker is a build-phase edit to the
# holdout set (test tampering) and must be reverted. Fail-closed: no marker → blocked.
if [[ "$NORM" =~ (^|/)tests/acceptance/ ]]; then
  MARKER="${CLAUDE_PROJECT_DIR:-.}/.rigel/acceptance.unlock"
  if [[ ! -f "$MARKER" ]]; then
    BLOCKERS+=("🚫 [HOOK] $NORM is a HOLDOUT acceptance test — editable only during the spec phase (/write-spec). Revert this change. Acceptance tests encode the spec's success criteria and must not be altered while building.")
  fi
fi

# Flush blockers to stderr and fail before the source-file filter, so non-.ts holdout
# writes are caught too.
if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
  for b in "${BLOCKERS[@]}"; do
    echo "$b" >&2
  done
  exit 2
fi

[[ ! -f "$FILE" ]] && exit 0

# Only check TypeScript source files
if [[ ! "$FILE" =~ \.ts$ ]]; then
  exit 0
fi

# Normalise to a path relative to the repo root so matching works whether the
# payload gives an absolute or relative path (strip everything before src/).
REL="$FILE"
if [[ "$REL" == *"/src/"* ]]; then
  REL="src/${REL##*/src/}"
fi

WARNINGS=()

# 1. console.log check in src/ (config/ is exempt — it hosts logger.ts)
if [[ "$REL" =~ ^src/ ]] && [[ ! "$REL" =~ src/config/ ]]; then
  if grep -qn "console\.\(log\|error\|warn\|info\)" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "console\.\(log\|error\|warn\|info\)" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] console.log found at $REL:$LINE — use logger from src/config/logger.ts")
  fi
fi

# 2. process.env check — only allowed in src/config/env.ts
if [[ "$REL" =~ ^src/ ]] && [[ ! "$REL" =~ src/config/env\.ts ]]; then
  if grep -qn "process\.env" "$FILE" 2>/dev/null; then
    LINE=$(grep -n "process\.env" "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] process.env found at $REL:$LINE — import from src/config/env.ts instead")
  fi
fi

# 3. File size check
LINE_COUNT=$(wc -l < "$FILE" 2>/dev/null || echo 0)
if [[ $LINE_COUNT -gt 400 ]]; then
  WARNINGS+=("⚠ [HOOK] $REL has $LINE_COUNT lines — exceeds 400 line limit. Split into focused modules.")
fi

# 4. `as SomeType` on external data check in repo files
if [[ "$REL" =~ \.repo\.ts$ ]]; then
  if grep -qn "return raw as " "$FILE" 2>/dev/null; then
    LINE=$(grep -n "return raw as " "$FILE" | head -1 | cut -d: -f1)
    WARNINGS+=("⚠ [HOOK] Unsafe cast at $REL:$LINE — use Schema.parse(raw.toJSON()) instead")
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
