#!/usr/bin/env bash
# .claude/hooks/post-write.sh
# Fires after every Write/Edit on Python files.
# Warns on: print(), os.environ, 400-line limit, raw dict cast on DB results.

set -euo pipefail

FILE=$(cat | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('file_path') or data.get('path') or '')
except:
    print('')
" 2>/dev/null || echo "")

[[ -z "$FILE" ]] && exit 0
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

for w in "${WARNINGS[@]}"; do
  echo "$w"
done

exit 0
