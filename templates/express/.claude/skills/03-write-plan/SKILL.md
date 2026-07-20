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

### Step 1b — Enforce the acceptance-test precondition

A spec may not be planned unless its acceptance tests exist and were proven red. For the
chosen `SPEC-XXX`, verify both before continuing:

```bash
# 1. Every AC-N in the spec has an acceptance test titled with its id.
test -d tests/acceptance/SPEC-XXX || { echo "BLOCK: no tests/acceptance/SPEC-XXX — run /write-spec's scaffolding step"; exit 1; }
# 2. The red-green proof was recorded pre-implementation.
test -f .rigel/redgreen/SPEC-XXX.json || { echo "BLOCK: no .rigel/redgreen/SPEC-XXX.json — run: npm run redgreen:record -- SPEC-XXX"; exit 1; }
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
| 4 | Migrations | `db/migrations/YYYYMMDD-create-{table}.cjs` × N | Runs clean, has down() |
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

## Step 4b — Cut the feature branch (from `main`, per `.rigel/git-policy.json`)

The build loop runs on a feature branch, **never on `main`** (which is protected). Cut it now —
named to match the policy pattern `^(feat|fix|chore|hotfix)/PLAN-\d{3}-[a-z0-9-]+$`, using the
same `PLAN-XXX-{slug}` as the plan file (`feat/` for a new feature; `fix/`/`chore/` when apt):

```bash
trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .rigel/git-policy.json)
git switch "$trunk" && git pull --ff-only origin "$trunk" 2>/dev/null || true
git switch -c feat/PLAN-XXX-{slug}      # resuming? use: git switch feat/PLAN-XXX-{slug}
```

`/build-layer` commits + pushes THIS branch each layer; `/open-pr` later lands it on `main`.

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
