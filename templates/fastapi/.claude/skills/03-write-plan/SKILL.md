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

### Step 1c — Enforce the impact declaration

A spec must state what it intends to break before it can be planned:

```bash
grep -q "^impact:" docs/product-specs/ready/SPEC-XXX*.md || \
  { echo "BLOCK: SPEC-XXX has no impact: block — run 'npx create-rigel impact', then declare"; exit 1; }
grep -qE "^\s*breaking:\s*(true|false)" docs/product-specs/ready/SPEC-XXX*.md || \
  { echo "BLOCK: SPEC-XXX's impact block must declare breaking: true|false"; exit 1; }
```

Declaring is cheap and over-declaring is free; the only thing that costs you is being wrong, which
the contract gate catches later. A spec that never states its intent gives the gate nothing to
verify against.

### Step 1d — A declared migration becomes Layer 0

If the spec's `impact` block lists files under `migrate:`, they become the plan's **first** layer —
before any feature work, so the feature is built on code Rigel already governs rather than adding to
the ungoverned pile:

```markdown
- [ ] Layer 0: Migrate — move <file> under the owning layer, update imports, add the missing tests
```

Move the file into the layer its role implies (a route → `src/runtime/routes/`, a data accessor →
`src/repo/`, business logic → `src/services/`) and bring it up to that layer's coverage threshold.
That threshold is why this is real work and not a `git mv`.

If `migrate:` is empty, add nothing. Declining is a normal answer and `docs/exec-plans/tech-debt-tracker.md`
is where those files wait — the point is that the choice was made deliberately, at the moment
someone was already in that code.


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

`/build-layer` builds these **in order**, finds the first unchecked `- [ ]` item, and ticks its
box (`- [ ]` → `- [x]`) once that layer's gate passes. Keep the `- [ ] Layer N: {Name}` prefix
exactly — the loop greps for it. **Delete any layer that doesn't apply to this feature.**

- [ ] Layer 1: Types — `src/types/{entity}_schema.py`, `exceptions.py` (zero imports, zero logic)
- [ ] Layer 2: Config — `src/config/settings.py` update, `constants.py` (no os.environ elsewhere)
- [ ] Layer 3: Models — `src/models/{entity}.py` × N (deleted_at, uuid7, indexes)
- [ ] Layer 4: Migrations — `alembic/versions/...` × N (runs clean, has downgrade())
- [ ] Layer 5: Repo — `src/repo/{entity}_repo.py` × N (model_validate, cursor, ownership, no N+1)
- [ ] Layer 6: Service — `src/services/{domain}_service.py` × N (no fastapi, ≥90% coverage)
- [ ] Layer 7: Runtime — `src/runtime/routers/v1/{resource}.py` × N (Depends(require_auth), typed return)
- [ ] Layer 8: Workers — `src/runtime/workers/{name}_worker.py` × N (model_validate payload, retry, logs)
- [ ] Layer 9: Tests — `tests/unit/`, `tests/integration/` (coverage gates)

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

## Step 4b — Cut the feature branch (from `main`, per `.rigel/git-policy.json`)

The build loop runs on a feature branch, **never on `main`** (protected). Cut it now, named to
match the policy pattern `^(feat|fix|chore|hotfix)/PLAN-\d{3}-[a-z0-9-]+$`, same `PLAN-XXX-{slug}`
as the plan file (`feat/` for a new feature; `fix/`/`chore/` when apt):

```bash
trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .rigel/git-policy.json)
git switch "$trunk" && git pull --ff-only origin "$trunk" 2>/dev/null || true
git switch -c feat/PLAN-XXX-{slug}      # resuming? use: git switch feat/PLAN-XXX-{slug}
```

`/build-layer` commits + pushes THIS branch each layer; `/open-pr` later lands it on `main`.

## Step 5 — Update Spec + Index
APPEND `PLAN-XXX` to the spec's `**Plan:**` field (do not overwrite) — a spec split across
several plans lists them all, e.g. `**Plan:** PLAN-003, PLAN-007`. Update index status to `PLANNED`.

## Step 6 — Tell the Human
```
Plan written: docs/exec-plans/active/PLAN-XXX-{slug}.md
{N} layers planned. Run /build-layer to start Layer 1.
```
