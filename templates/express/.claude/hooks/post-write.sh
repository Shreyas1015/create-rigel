#!/usr/bin/env bash
# .claude/hooks/post-write.sh
# Fires after every Write/Edit/MultiEdit tool call.
# Claude Code passes the tool invocation as JSON on stdin; the edited file
# path lives at .tool_input.file_path.
# Checks: console.log, process.env outside config, file size, unsafe casts.
# Prints warnings directly — gate-checker does the hard blocking.

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

# Print all warnings
for w in "${WARNINGS[@]}"; do
  echo "$w"
done

# Exit 0 always — hooks warn, gate-checker blocks
exit 0
