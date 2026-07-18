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
