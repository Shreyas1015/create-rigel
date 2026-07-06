# /write-spec — Write a Product Spec

**Verified:** 2026-06-19 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/write-spec`

## Step 1 — Consult the Roadmap (if present)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null
```
If it exists, read it. Pick the first row with Status `NOT_STARTED` — the **walking skeleton**
if nothing is created yet, otherwise the next dependency-unblocked row. Use that row's Name,
Epic, and Depends-On to pre-fill the spec's title and the `**Epic:**` / `**Depends on:**` fields.
If no roadmap exists, proceed ad hoc (a single standalone spec).

## Step 2 — Get Next Spec Number
```bash
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort | tail -1
```
Increment by 1. Start at SPEC-001 if none. (`ROADMAP.md` is CAPS, so the `grep SPEC-` is unaffected.)

## Step 3 — Write the Spec
Save to: `docs/product-specs/draft/SPEC-XXX-{slug}.md`

```markdown
# SPEC-XXX — {Feature Name}

**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** —
**Epic:** —          <!-- from ROADMAP.md row, if roadmap-driven -->
**Depends on:** —    <!-- from ROADMAP.md row, if roadmap-driven -->

---

## Problem Statement
{what problem, who has it, why it matters}

## What We're Building
{the solution at high level}

## Core Entities
| Entity | Purpose |
|---|---|

## API Endpoints
{METHOD /path — description}

## Business Rules
{numbered list}

## State Machine (if applicable)
{ASCII diagram + transition rules}

## Non-Functional Requirements
{performance, rate limits, auth, coverage targets}

## Out of Scope (v1)
{what is NOT being built}

## Acceptance Criteria
- [ ] {testable, specific}
```

## Step 4 — Update Index + Roadmap
Add row to `docs/product-specs/index.md`: `| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`
If this spec came from a `ROADMAP.md` row, flip that row: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 5 — Tell the Human
```
Spec written: docs/product-specs/draft/SPEC-XXX-{slug}.md
Status: DRAFT

Review it. When satisfied:
  1. Move to: docs/product-specs/ready/SPEC-XXX-{slug}.md
  2. Change Status: DRAFT → READY
  3. Run /write-plan

Claude will not create a plan until the spec is in ready/.
```
