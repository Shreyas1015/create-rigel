---
name: 07-layer-check
description: /layer-check — Ad-hoc Architecture Violation Scan
verified: 2026-06-04
libraries: []
source: ARCHITECTURE.md
note: Process skill — architecture scan, no library dependencies.
---

# /layer-check — Ad-hoc Architecture Violation Scan

Triggered by: `/layer-check`
Scans the entire codebase for architecture violations right now.
Does not require an active plan.

---

## Scans

```bash
echo "=== 1. Circular Imports ==="
npx madge --circular src/ --extensions ts

echo "=== 2. File Size Violations ==="
find src/ -name "*.ts" | xargs wc -l | awk '$1 > 400 { print "VIOLATION:", $2, $1, "lines" }' | sort -rn

echo "=== 3. console.log in src/ ==="
grep -rn "console\.\(log\|error\|warn\|info\)" src/ \
  --include="*.ts" \
  --exclude-dir="config"

echo "=== 4. process.env outside config ==="
grep -rn "process\.env" src/ --include="*.ts" | grep -v "src/config/env.ts"

echo "=== 5. TypeScript compilation ==="
npx tsc --noEmit 2>&1

echo "=== 6. ESLint ==="
npx eslint src/ --max-warnings=0 2>&1

echo "=== 7. Architecture structural tests ==="
npx jest tests/architecture/ --no-coverage --verbose 2>&1

echo "=== 8. Unsafe casts in repo ==="
grep -rn "return raw as\|as Application\|as User\|as Note" src/repo/ --include="*.ts"
```

## Output
```
LAYER CHECK — {timestamp}

Circular imports:     NONE / {list}
File size violations: NONE / {list}
console.log:          NONE / {list}
process.env:          NONE / {list}
TypeScript:           CLEAN / {errors}
ESLint:               CLEAN / {errors}
Arch tests:           PASS / FAIL
Unsafe casts in repo: NONE / {list}

OVERALL: ✅ CLEAN  /  ❌ {N} violations
```
