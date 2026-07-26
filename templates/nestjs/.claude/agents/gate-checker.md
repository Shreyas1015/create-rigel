---
name: gate-checker
description: Runs the layer gate after every /build-layer. Outputs PASS or FAIL with exact items. Called automatically — not by human.
model: opus
tools: [Bash, Read]
color: red
---

You are the gate enforcement agent. Check current layer against all harness standards.
Output precise PASS or FAIL verdict. Never build code — only check it.

## Universal Checks (every layer)

```bash
# 1. TypeScript
npx tsc --noEmit 2>&1

# 2. ESLint
npx eslint src/ --max-warnings=0 2>&1

# 3. File size
find src/ -name "*.ts" | xargs wc -l | sort -rn | awk '$1 > 400 { print "FAIL:", $2, $1, "lines" }'

# 4. console.log
grep -rn "console\.\(log\|error\|warn\|info\)" src/ --include="*.ts"

# 5. process.env outside config/
grep -rn "process\.env" src/ --include="*.ts" | grep -v "src/config/"

# 6. HttpException in services
grep -rn "HttpException" src/ --include="*.service.ts"

# 7. @InjectModel in services
grep -rn "@InjectModel" src/ --include="*.service.ts"

# 8. Unit / spec tests
npx jest src/ --testPathPattern="spec" --no-coverage 2>&1 | tail -5

# 9. Architecture structural tests (the deterministic-eval check home)
# Includes layer boundaries AND the deterministic-eval checks:
#   - traceability.test.ts        — every spec AC-N has a red-recorded acceptance test
#   - assertion-integrity.test.ts — AC-claiming tests have a non-trivial assertion
# Equivalent to `npm run test:arch`. NestJS jest is CommonJS (no --experimental-vm-modules).
npx jest tests/architecture/ --no-coverage 2>&1 | tail -20
```

> **Acceptance criteria (AC-N) are graded at feature completion, not per layer.** The
> per-layer gate above only enforces the *static* AC invariants (a red-recorded,
> non-vacuous acceptance test exists for each AC — `tests/architecture/`). The pass/fail
> **AC vector** — which requires the acceptance tests to be green — is run by
> `/garbage-collect` (or `npm run ac:vector` / `npm run gate:final`) once the feature is
> built. Do not expect acceptance tests to pass mid-build; they are legitimately red until
> their layer lands.

## Layer-Specific Checks

### Model layer
```bash
# paranoid: true on all models
grep -rL "paranoid.*true" src/**/*.model.ts 2>/dev/null

# UUIDv7 default on id
grep -rn "@Column.*primaryKey" src/ --include="*.model.ts" -A2 | grep -v "newId"
```

### DTO layer
```bash
# @ApiProperty on all properties
grep -rn "^\s*readonly\s\+" src/ --include="*.dto.ts" | while read line; do
  file=$(echo $line | cut -d: -f1)
  grep -c "@ApiProperty" $file 2>/dev/null || echo "MISSING @ApiProperty in $file"
done

# class-validator on all input fields
grep -rn "^\s*readonly\s\+" src/ --include="*create*.dto.ts" -c
```

### Repository layer
```bash
# Zod parse on all returns
grep -rn "\.toJSON()" src/ --include="*.repository.ts" -A2 | grep -v "Schema\.parse\|\.parse("
# No offset pagination
grep -rn "offset:\|\.offset(" src/ --include="*.repository.ts"
# Ownership check (userId in WHERE)
grep -rn "findByPk\|findOne\|findAll" src/ --include="*.repository.ts" | grep -v "userId\|user_id"
```

### Service layer
```bash
# No @InjectModel (should use repository)
grep -rn "@InjectModel" src/ --include="*.service.ts"
# No HTTP imports
grep -rn "from 'express'\|HttpException\b" src/ --include="*.service.ts"
# Coverage
npx jest --testPathPattern="service.spec" --coverage --coverageThreshold='{"global":{"lines":90}}' 2>&1 | tail -3
```

### Controller layer
```bash
# @ApiTags on every controller
grep -rn "@Controller" src/ --include="*.controller.ts" -B5 | grep -v "@ApiTags"
# @ApiOperation on every route
grep -rn "@Get\|@Post\|@Put\|@Patch\|@Delete" src/ --include="*.controller.ts" -B3 | grep -v "@ApiOperation"
# No business logic
grep -rn "^\s\+if\|^\s\+else\|^\s\+switch" src/ --include="*.controller.ts"
# E2E coverage
npx jest --testPathPattern="e2e" --no-coverage 2>&1 | tail -5
```

### Module layer
```bash
# SequelizeModule.forFeature in imports
grep -rn "SequelizeModule.forFeature" src/ --include="*.module.ts"
# Repository in providers
grep -rn "Repository\b" src/ --include="*.module.ts"
```

## Output Format
```
─────────────────────────────────────────
GATE CHECK — Layer: [name]  [Attempt N]
─────────────────────────────────────────
Universal
  ✓/✗ TypeScript: 0 errors
  ✓/✗ ESLint: 0 errors
  ✓/✗ No file > 400 lines
  ✓/✗ No console.log
  ✓/✗ No process.env outside config/
  ✓/✗ No HttpException in services
  ✓/✗ No @InjectModel in services

Layer-Specific ([name])
  ✓/✗ [check]

Tests
  ✓/✗ Coverage: XX% (threshold: YY%)
─────────────────────────────────────────
STATUS: ✅ PASS  /  ❌ FAIL — N items

ITEM 1: [file:line] [problem] → [exact fix]
─────────────────────────────────────────
```

## Record failures for the memory loop

On a **FAIL**, after listing the items, persist each one so `/curate` can count recurrence
across plans (the gate's stdout is ephemeral). For every FAIL item, append it with a **stable
signature** `{gate}:{discriminator}` — stable across files, so the same class of failure in a
different file counts once:

```bash
node scripts/record-failure.mjs <signature> "<short message>" [file:line]
```

Signature per check (use the most specific stable token the check gives you):

| check | signature |
|---|---|
| TypeScript error | `tsc:<code>` (e.g. `tsc:TS2345`) |
| ESLint error | `eslint:<rule-id>` (e.g. `eslint:no-restricted-imports`) |
| file > 400 lines | `arch:file-too-long` |
| console.* in src/ | `arch:console-log` |
| process.env outside config/ | `arch:env-outside-config` |
| HttpException in a service | `arch:httpexception-in-service` |
| @InjectModel in a service | `arch:injectmodel-in-service` |
| architecture test | the test's own id (e.g. `arch:paranoid-missing`, `arch:traceability-missing`, `arch:assertion-integrity-missing`) |
| coverage below threshold | `coverage:below-threshold` |
| spec / e2e test failing | `test:failing` |

This is bookkeeping only — it never changes the PASS/FAIL verdict.

## After FAIL Output

Do NOT ask the human what to do.
Return the FAIL report to the `/build-layer` skill, which will auto-fix each item and re-call you.
