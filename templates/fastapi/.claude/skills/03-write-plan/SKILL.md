# /write-plan — Write an Execution Plan

**Verified:** 2026-06-19 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/write-plan`

## Step 1 — Find Ready Spec
```bash
ls docs/product-specs/ready/
```
If none → tell human to mark a spec READY first. Stop.
If multiple → list them and ask which one to plan.

### Step 1b — Enforce the acceptance-test precondition

A spec may not be planned unless its acceptance tests exist and were proven red. For the
chosen `SPEC-XXX`, verify both before continuing:

```bash
# 1. Every AC-N in the spec has an acceptance test carrying its id.
test -d tests/acceptance/SPEC-XXX || { echo "BLOCK: no tests/acceptance/SPEC-XXX — run /write-spec's scaffolding step"; exit 1; }
# 2. The red-green proof was recorded pre-implementation.
test -f .rigel/redgreen/SPEC-XXX.json || { echo "BLOCK: no .rigel/redgreen/SPEC-XXX.json — run: uv run python scripts/redgreen_record.py SPEC-XXX"; exit 1; }
```

If either is missing, **stop** and tell the human the spec is not eligible: its acceptance
tests / red-green proof must be created by `/write-spec` first (the `tests/architecture/`
traceability test would otherwise fail the very first gate). Do not hand-create these here —
they belong to the spec phase and the holdout hook blocks writing them outside it.

> A large spec may span MULTIPLE plans — slice it into shippable milestones, each its own
> `PLAN-XXX` that ends green (e.g. data model + CRUD; then an external integration; then
> reporting). Plans are numbered independently, so just create the next plan for the same spec.

## Step 2 — Get Next Plan Number
```bash
ls docs/exec-plans/{active,completed}/ 2>/dev/null | grep "PLAN-" | sort | tail -1
```

## Step 3 — Read the Spec
Identify all entities → models + migrations + repos + services.
Identify all endpoints → routers. Background jobs → workers.

## Step 4 — Write the Plan
Save to: `docs/exec-plans/active/PLAN-XXX-{slug}.md`

```markdown
# PLAN-XXX — {Feature Name}

**Status:** IN_PROGRESS
**Spec:** docs/product-specs/ready/SPEC-XXX-{slug}.md
**Created:** YYYY-MM-DD
**Completed:** —

---

## Goal
{one sentence}

---

## Layer Build Order

| # | Layer | Files | Gate Focuses On |
|---|---|---|---|
| 1 | Types | `src/types/{entity}_schema.py`, `exceptions.py` | Zero imports, zero logic |
| 2 | Config | `src/config/settings.py` update, `constants.py` | No os.environ elsewhere |
| 3 | Models | `src/models/{entity}.py` × N | deleted_at, uuid7, indexes |
| 4 | Migrations | `alembic/versions/...` × N | Runs clean, has downgrade() |
| 5 | Repo | `src/repo/{entity}_repo.py` × N | model_validate, cursor, ownership, no N+1 |
| 6 | Service | `src/services/{domain}_service.py` × N | No fastapi, ≥90% coverage |
| 7 | Runtime | `src/runtime/routers/v1/{resource}.py` × N | Depends(require_auth), typed return |
| 8 | Workers | `src/runtime/workers/{name}_worker.py` × N | model_validate payload, retry, logs |
| 9 | Tests | `tests/unit/`, `tests/integration/` | Coverage gates |

---

## Acceptance Criteria
- [ ] {from spec}

---

## Progress Log
### {date} — Plan created

---

## Decision Log
*(filled during build)*
```

## Step 5 — Update Spec + Index
APPEND `PLAN-XXX` to the spec's `**Plan:**` field (do not overwrite) — a spec split across
several plans lists them all, e.g. `**Plan:** PLAN-003, PLAN-007`. Update index status to `PLANNED`.

## Step 6 — Tell the Human
```
Plan written: docs/exec-plans/active/PLAN-XXX-{slug}.md
{N} layers planned. Run /build-layer to start Layer 1.
```
