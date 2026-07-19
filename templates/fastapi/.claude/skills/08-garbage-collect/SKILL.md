# /garbage-collect — End-of-Feature Cleanup

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/garbage-collect`

## Steps

### 1. File Size
```bash
find src/ -name "*.py" | xargs wc -l | awk '$1 > 400 { print $2, $1 }' | sort -rn
```
Split any file over 400 lines.

### 2. ruff + mypy
```bash
uv run ruff check src/ --fix
uv run mypy src/
```

### 3. Stale Docs
Check AGENTS.md, ARCHITECTURE.md, decisions/index.md, .env.example.

### 4. QUALITY_SCORE.md
```bash
uv run pytest --cov=src --cov-report=term-missing 2>&1 | tail -20
```
Update domain grades.

### 5. Log Debt → `docs/exec-plans/tech-debt-tracker.md`

### 5b. Advisory spec-judge (log-only, never blocks)
The AC vector (Step 6) proves the *named* criteria pass; it cannot judge whether the spec's
**intent** was honored or the **abstraction** is right. Run the advisory judge for that remainder:

- Call the `spec-judge` agent. It reads ONLY the spec + the feature diff (never this transcript),
  and appends an `### spec-judge (ADVISORY — non-blocking)` block to the active plan with a
  per-AC + intent + abstraction verdict, routing anything UNKNOWN to `.rigel/judge-review-queue/`.

This is **advisory**: it does NOT gate plan-close. Do not fix code to satisfy the judge and do not
skip closing because of a judge FAIL — surface its block to the human and let them decide. (The
judge stays log-only until a calibration report promotes a dimension to blocking.)

### 6. Close Plan
- All `[x]` confirmed
- **Grade the outcome, not the checkboxes** — run the AC vector, which runs the spec's
  acceptance tests and asserts every `AC-N` is PASS (test exists, was proven red, now green):

  ```bash
  uv run python scripts/ac_vector.py   # exits non-zero unless every AC is PASS; appends the vector to the plan
  ```

  Do NOT close the plan while any AC is FAIL / MISSING / INVALID — those are unmet criteria,
  not paperwork. Fix the code (or, if a criterion is genuinely dropped, remove its AC in the
  spec and its acceptance test during a fresh spec phase) and re-run.
- `Status: COMPLETE`, `Completed: YYYY-MM-DD`
- Move `active/PLAN-XXX.md` → `completed/`

### 7. Mark Spec Shipped
- `Status: SHIPPED` in spec file
- Update `docs/product-specs/index.md`

### 8. Final Commit
```bash
git add -A
git commit -m "chore: garbage collect — close PLAN-XXX"
git push origin main
```
