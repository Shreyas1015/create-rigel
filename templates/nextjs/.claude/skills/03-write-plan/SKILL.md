# /write-plan — Write an Execution Plan

Triggered by: `/write-plan`

## Step 1 — Find Ready Spec
```bash
ls docs/product-specs/ready/
```
If none → tell human to mark a spec READY first. Stop.

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

> A large feature area may span MULTIPLE plans — slice it into shippable milestones, each its
> own `PLAN-XXX` that ends green (e.g. live feed; then drill-in; then filters/export). Plans are
> numbered independently, so just create the next plan for the same spec.

### Step 1c — Enforce the impact declaration

A spec must state what it intends to break before it can be planned:

```bash
grep -q "^impact:" docs/product-specs/ready/SPEC-XXX*.md || \
  { echo "BLOCK: SPEC-XXX has no impact: block — run 'npx create-rigel impact', then declare"; exit 1; }
grep -qE "^\s*breaking:\s*(true|false)" docs/product-specs/ready/SPEC-XXX*.md || \
  { echo "BLOCK: SPEC-XXX's impact block must declare breaking: true|false"; exit 1; }
```

Declaring is cheap and over-declaring is free. This app consumes contracts rather than publishing
one, so there is no oasdiff cross-check here — the declaration is a written record of intent, and
`breaking: true` means the PROVIDER repo owes a contract change before this ships.

### Step 1d — Enforce the grill

A spec may not be planned while it is still guessing. The acceptance tests are already locked by
this point, so an unresolved assumption here is one that will be *built*:

```bash
test -f .rigel/grill/SPEC-XXX.json || \
  { echo "BLOCK: SPEC-XXX was never grilled — run: npm run grill:record -- SPEC-XXX"; exit 1; }
```

`grill:record` only writes that file once every open question is answered and no `[ASSUMED]` marker
remains, so its presence is the proof. If it is missing, go back to `/write-spec`'s grill step —
answering the questions is cheap; discovering the wrong requirement after three layers is not.

### Step 1e — Enforce the design decisions

A spec may not be planned while the decisions it owes are unrecorded. They get made either way —
inside `/build-layer`, by whoever writes that layer, with nothing to review:

```bash
npm run design:check || \
  { echo "BLOCK: SPEC-XXX has unrecorded design decisions — run /write-design"; exit 1; }
```

The required list is derived from the spec's own endpoints and entities, so this is not a matter of
taste: an endpoint with no authorization decision is a fact about the spec.

### Step 1d — A declared migration becomes Layer 0

If the spec's `impact` block lists files under `migrate:`, they become the plan's **first** layer —
before any feature work, so the feature is built on code Rigel already governs rather than adding to
the ungoverned pile:

```markdown
- [ ] Layer 0: Migrate — move <file> under the owning layer, update imports, add the missing tests
```

Move the file into the layer its role implies (a route handler → `app/api/`, shared UI → `components/`,
data access → `lib/`) and bring it up to that area's coverage threshold. That threshold is why this is
real work and not a `git mv`.

If `migrate:` is empty, add nothing. Declining is a normal answer and `docs/exec-plans/tech-debt-tracker.md`
is where those files wait — the point is that the choice was made deliberately, at the moment someone
was already in that code.

## Step 2 — Get Next Plan Number
```bash
ls docs/exec-plans/{active,completed}/ 2>/dev/null | grep "PLAN-" | sort | tail -1
```

## Step 3 — Read the Spec
From the spec, identify:
- API Endpoints Used → determines hooks layer files
- Screens/Views → determines features + app layers
- Business rules → determines store needs

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

## Pre-Build Step
Run `/api-sync` to ensure `src/types/api.generated.ts` is current.

---

## Layer Build Order

`/build-layer` builds these **in order**, finds the first unchecked `- [ ]` item, and ticks its
box (`- [ ]` → `- [x]`) once that layer's gate passes. Keep the `- [ ] Layer N: {Name}` prefix
exactly — the loop greps for it. **Delete any layer that doesn't apply to this feature.**

- [ ] Layer 1: Types — `src/types/domain.types.ts` additions (zero imports, no API duplication)
- [ ] Layer 2: Lib — `src/lib/env.ts` update (if new vars), `constants.ts` (process.env only in env.ts)
- [ ] Layer 3: Hooks — `src/hooks/use-{domain}.ts` × N (openapi-fetch only, error handling, query keys)
- [ ] Layer 4: Store — `src/store/{domain}-store.ts` (if client state needed) (UI state only, no server data)
- [ ] Layer 5: Features — `src/features/{domain}/` components + forms (loading/error/empty states, a11y)
- [ ] Layer 6: Components — `src/components/shared/` new shared components (props typed, no domain logic)
- [ ] Layer 7: App — `app/(dashboard)/{route}/page.tsx` + layout changes (no business logic in pages)
- [ ] Layer 8: Tests — `tests/unit/`, `tests/e2e/` (coverage gates, E2E critical paths)

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
APPEND `PLAN-XXX` to the spec's `**Plan:**` field (do not overwrite) — a feature split across
several plans lists them all, e.g. `**Plan:** PLAN-003, PLAN-007`. Update index to `PLANNED`.

## Step 6 — Tell Human
```
Plan written: docs/exec-plans/active/PLAN-XXX-{slug}.md

IMPORTANT: Run /api-sync before /build-layer if openapi.json exists.

{N} layers planned. Run /build-layer to start.
```
