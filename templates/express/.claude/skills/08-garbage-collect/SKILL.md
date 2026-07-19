---
name: 08-garbage-collect
description: /garbage-collect — End-of-Feature Cleanup
verified: 2026-06-04
libraries: []
source: docs/QUALITY_SCORE.md
note: Process skill — cleanup workflow, no library dependencies.
---

# /garbage-collect — End-of-Feature Cleanup

Triggered by: `/garbage-collect`
Run after every feature is complete (all plan layers checked off).

---

## Steps (run in order, auto-fix everything)

### 1. File Size
```bash
find src/ -name "*.ts" | xargs wc -l | awk '$1 > 400 { print $2, $1 }' | sort -rn
```
For any file over 400 lines: split it. Update imports everywhere.

### 2. Layer Violations
```bash
npx madge --circular src/ --extensions ts
npx eslint src/ --max-warnings=0
```
Fix any violations.

### 3. Stale Documentation
- Read `AGENTS.md` — does it list all current skills and agents?
- Read `ARCHITECTURE.md` — does it match current source structure?
- Read `docs/design-docs/decisions/index.md` — are all ADRs listed?
Update anything stale.

### 4. Update QUALITY_SCORE.md
```bash
npm test -- --coverage --coverageReporters=text 2>&1 | grep -A20 "Coverage summary"
```
Update grade for every domain touched in this feature.

### 5. Log Tech Debt
Any shortcuts taken → add to `docs/exec-plans/tech-debt-tracker.md`.

### 5b. Advisory spec-judge (log-only, never blocks)
The AC vector (Step 6) proves the *named* criteria pass; it cannot judge whether the spec's
**intent** was honored or the **abstraction** is right. Run the advisory judge for that remainder:

- Call the `spec-judge` agent. It reads ONLY the spec + the feature diff (never this transcript),
  and appends an `### spec-judge (ADVISORY — non-blocking)` block to the active plan with a
  per-AC + intent + abstraction verdict, routing anything UNKNOWN to `.rigel/judge-review-queue/`.

This is **advisory**: it does NOT gate plan-close. Do not fix code to satisfy the judge and do not
skip closing because of a judge FAIL — surface its block to the human and let them decide. (The
judge stays log-only until a calibration report promotes a dimension to blocking.)

### 6. Close the Plan
- Read active plan
- Confirm ALL layer checkboxes are `[x]`
- **Grade the outcome, not the checkboxes** — run the AC vector, which runs the spec's
  acceptance tests and asserts every `AC-N` is PASS (test exists, was proven red, now green):

  ```bash
  npm run ac:vector   # exits non-zero unless every AC is PASS; appends the vector to the plan
  ```

  Do NOT close the plan while any AC is FAIL / MISSING / INVALID — those are unmet criteria,
  not paperwork. Fix the code (or, if a criterion is genuinely dropped, remove its AC in the
  spec and its acceptance test during a fresh spec phase) and re-run.
- Set `**Status:** COMPLETE` and `**Completed:** YYYY-MM-DD`
- Move: `docs/exec-plans/active/PLAN-XXX.md` → `docs/exec-plans/completed/PLAN-XXX.md`

### 7. Mark Spec Shipped
- In `docs/product-specs/ready/SPEC-XXX.md`: set `**Status:** SHIPPED`
- In `docs/product-specs/index.md`: update row status

### 8. Final Commit
```bash
git add -A
git commit -m "chore: garbage collect — close PLAN-XXX

- QUALITY_SCORE.md updated: [domain: grade, ...]
- Tech debt logged: [N] items
- PLAN-XXX → completed/
- SPEC-XXX marked SHIPPED"
git push origin main
```

### 9. Report
```
═══════════════════════════════════════
GARBAGE COLLECT COMPLETE
═══════════════════════════════════════
Files split:         N
Violations fixed:    N
Stale docs updated:  N
Quality scores:
  {domain}: {grade} ({coverage}%)
Debt logged:         N items (see tech-debt-tracker.md)
Plan closed:         PLAN-XXX
Spec shipped:        SPEC-XXX

Next: /write-spec for the next feature
═══════════════════════════════════════
```
