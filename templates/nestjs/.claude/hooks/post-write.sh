#!/usr/bin/env bash
# Fires after every Write/Edit on TypeScript files.
# Catches NestJS-specific violations immediately.

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

for w in "${WARNINGS[@]}"; do
  echo "$w"
done

exit 0
