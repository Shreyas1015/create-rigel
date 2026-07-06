# /write-spec — Write a Product Spec

Triggered by: `/write-spec`

## Step 1 — Consult the Roadmap (if present)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null
```
If it exists, read it. Pick the first row with Status `NOT_STARTED` — the **walking skeleton**
if nothing is built yet, otherwise the next dependency-unblocked row **whose `Implements`
(backend SPEC) is SHIPPED** (don't build UI for an endpoint the backend hasn't shipped). Use
that row's Name, Feature Area, Implements, and Depends-On to pre-fill the spec. If no roadmap
exists, proceed ad hoc (a single standalone spec).

## Step 2 — Get Next Spec Number
```bash
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort | tail -1
```
(`ROADMAP.md` is CAPS, so this `grep SPEC-` is unaffected.)

## Step 3 — Write the Spec
Save to: `docs/product-specs/draft/SPEC-XXX-{slug}.md`

```markdown
# SPEC-XXX — {Feature Name}

**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** —
**Feature area:** —               <!-- from ROADMAP.md row, if roadmap-driven -->
**Implements (backend SPEC):** —  <!-- backend spec/domain this UI consumes -->
**Depends on:** —                 <!-- other frontend specs, from ROADMAP.md -->

---

## Problem Statement

## What We're Building

## Screens / Views
| Screen | Route | Description |
|---|---|---|

## User Flows
{numbered steps for each key flow}

## API Endpoints Used
{list endpoints from the backend this feature consumes}
{These determine what will be in the hooks layer}

## Business Rules (Frontend)
{Validation rules, state machine UI, conditional rendering}

## Non-Functional Requirements
{Performance targets, accessibility requirements, responsive breakpoints}

## Out of Scope (v1)

## Acceptance Criteria
- [ ] {testable, specific}
```

## Step 4 — Update Index + Roadmap
Add to `docs/product-specs/index.md`: `| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`
If this spec came from a `ROADMAP.md` row, flip that row: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 5 — Tell the Human
```
Spec written: docs/product-specs/draft/SPEC-XXX-{slug}.md

Review it. When satisfied:
  1. Move to: docs/product-specs/ready/SPEC-XXX-{slug}.md
  2. Change Status: DRAFT → READY
  3. Run /write-plan

Claude will not create a plan until the spec is in ready/.
```
