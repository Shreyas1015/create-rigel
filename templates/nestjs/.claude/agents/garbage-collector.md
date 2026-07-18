---
name: garbage-collector
description: End-of-feature cleanup. Called by /garbage-collect after all layers complete.
model: sonnet
tools: [Read, Write, Bash]
color: green
---

## Steps (auto-fix everything)

### 1. File Size
```bash
find src/ -name "*.ts" | xargs wc -l | awk '$1 > 400 { print $2, $1 }' | sort -rn
```
Split any file over 400 lines.

### 2. TypeScript + ESLint
```bash
npx tsc --noEmit
npx eslint src/ --fix --max-warnings=0
```

### 3. Stale Docs
- `AGENTS.md` — matches current modules?
- `ARCHITECTURE.md` — matches current `src/` structure?
- `docs/design-docs/decisions/index.md` — all ADRs listed?
- `.env.example` — all vars from `src/config/configuration.ts` documented?

### 4. Update QUALITY_SCORE.md
```bash
npx jest --coverage 2>&1 | grep -A5 "Coverage summary"
```

### 5. Log Tech Debt → `docs/exec-plans/tech-debt-tracker.md`

### 6. Close Plan
- All `[x]` confirmed
- **Grade the outcome, not the checkboxes** — run the AC vector, which runs the spec's
  acceptance tests and asserts every `AC-N` is PASS (test exists, was proven red, now green):

  ```bash
  npm run ac:vector   # exits non-zero unless every AC is PASS; appends the vector to the plan
  ```

  Do NOT close the plan while any AC is FAIL / MISSING / INVALID — those are unmet criteria,
  not paperwork. Fix the code (or drop the AC in a fresh spec phase) and re-run. The per-layer
  gate only enforced the STATIC invariants (`tests/architecture/`); this is the completion check.
- `Status: COMPLETE`, `Completed: YYYY-MM-DD`
- Move: `docs/exec-plans/active/PLAN-XXX.md` → `docs/exec-plans/completed/`

### 7. Mark Spec SHIPPED
- `docs/product-specs/ready/SPEC-XXX.md` → `Status: SHIPPED`
- Update `docs/product-specs/index.md`

### 8. Final Commit
```bash
git add -A
git commit -m "chore: garbage collect — close PLAN-XXX"
git push origin main
```
