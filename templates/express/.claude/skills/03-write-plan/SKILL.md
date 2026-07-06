---
name: 03-write-plan
description: /write-plan — Write an Execution Plan
verified: 2026-06-19
libraries: []
source: docs/PLANS.md
note: Process skill — no library dependencies, no freshness check needed.
---

# /write-plan — Write an Execution Plan

Triggered by: `/write-plan`

---

## Step 1 — Find Ready Spec

```bash
ls docs/product-specs/ready/
```

If none → tell human to mark a spec READY first. Stop.
If multiple → list them and ask which one to plan.

> A large spec may span MULTIPLE plans — slice it into shippable milestones, each its own
> `PLAN-XXX` that ends green (e.g. data model + CRUD; then an external integration; then
> reporting). Plans are numbered independently, so just create the next plan for the same spec.

## Step 2 — Get Next Plan Number
```bash
ls docs/exec-plans/{active,completed}/ 2>/dev/null | grep "PLAN-" | sort | tail -1
```
Increment by 1. Start at PLAN-001 if none.

## Step 3 — Read the Spec
Read the full READY spec. Identify:
- All entities → determine model + migration + repo + service files
- All endpoints → determine route files
- Any background jobs → determine worker files
- State machines → note in service layer
- Non-functional requirements → note in tests layer

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
{One sentence: what does this plan deliver?}

---

## Layer Build Order

| # | Layer | Files | Gate Focuses On |
|---|---|---|---|
| 1 | Types | `src/types/{entity}.types.ts`, `common.types.ts` | Zero imports, zero logic |
| 2 | Config | `src/config/env.ts` update, `constants.ts` | No process.env elsewhere |
| 3 | Models | `src/models/{Entity}.model.ts` × N | paranoid, UUIDv7, indexes |
| 4 | Migrations | `db/migrations/YYYYMMDD-create-{table}.js` × N | Runs clean, has down() |
| 5 | Repo | `src/repo/{entity}.repo.ts` × N | Zod parse, cursor pagination, ownership, no N+1 |
| 6 | Service | `src/services/{domain}.service.ts` × N | No express imports, ≥90% coverage |
| 7 | Runtime | `src/runtime/routes/v1/{resource}.route.ts` × N | Auth first, envelope, rate-limit |
| 8 | Workers | `src/runtime/workers/{name}.worker.ts` × N | Zod payload, retry, observability |
| 9 | Tests | `tests/unit/`, `tests/integration/` | Coverage gates, load test |

*(Remove rows that don't apply to this feature)*

---

## Acceptance Criteria
{Copy from spec — these become the final gate}
- [ ] criterion
- [ ] criterion

---

## Progress Log

### {date} — Plan created
- Spec {SPEC-XXX} confirmed READY
- {N} layers planned

---

## Decision Log

*(Filled during build)*

---

## Known Constraints
{Any technical decisions already made or constraints from the spec}
```

## Step 5 — Update Spec
In `docs/product-specs/ready/SPEC-XXX.md`, **APPEND** `PLAN-XXX` to the `**Plan:**` field — do
not overwrite. A spec split across multiple plans lists them all (e.g. `**Plan:** PLAN-003, PLAN-007`).
If the field is still `—`, replace it with `PLAN-XXX`.

## Step 6 — Update Index
In `docs/product-specs/index.md`: update status to `PLANNED`

## Step 7 — Tell the Human
```
Plan written: docs/exec-plans/active/PLAN-XXX-{slug}.md

{N} layers planned. Build order:
  1. Types
  2. Config
  ...

Run /build-layer to start Layer 1.
Claude will automatically find the next unchecked layer each time.
```
