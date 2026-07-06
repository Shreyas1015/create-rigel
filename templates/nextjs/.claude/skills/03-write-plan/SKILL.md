# /write-plan — Write an Execution Plan

Triggered by: `/write-plan`

## Step 1 — Find Ready Spec
```bash
ls docs/product-specs/ready/
```
If none → tell human to mark a spec READY first. Stop.

> A large feature area may span MULTIPLE plans — slice it into shippable milestones, each its
> own `PLAN-XXX` that ends green (e.g. live feed; then drill-in; then filters/export). Plans are
> numbered independently, so just create the next plan for the same spec.

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

| # | Layer | Files | Gate Focuses On |
|---|---|---|---|
| 1 | Types | `src/types/domain.types.ts` additions | Zero imports, no API duplication |
| 2 | Lib | `src/lib/env.ts` update (if new vars), constants | process.env only in env.ts |
| 3 | Hooks | `src/hooks/use-{domain}.ts` × N | openapi-fetch only, error handling, query keys |
| 4 | Store | `src/store/{domain}-store.ts` (if client state needed) | UI state only, no server data |
| 5 | Features | `src/features/{domain}/` — components + forms | Loading/error/empty states, a11y |
| 6 | Components | `src/components/shared/` — new shared components | Props typed, no domain logic |
| 7 | App | `app/(dashboard)/{route}/page.tsx` + layout changes | No business logic in pages |
| 8 | Tests | `tests/unit/`, `tests/e2e/` | Coverage gates, E2E critical paths |

*(Remove layers that don't apply to this feature)*

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
APPEND `PLAN-XXX` to the spec's `**Plan:**` field (do not overwrite) — a feature split across
several plans lists them all, e.g. `**Plan:** PLAN-003, PLAN-007`. Update index to `PLANNED`.

## Step 6 — Tell Human
```
Plan written: docs/exec-plans/active/PLAN-XXX-{slug}.md

IMPORTANT: Run /api-sync before /build-layer if openapi.json exists.

{N} layers planned. Run /build-layer to start.
```
