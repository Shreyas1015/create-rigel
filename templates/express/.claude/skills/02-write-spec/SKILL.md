---
name: 02-write-spec
description: /write-spec — Write a Product Spec
verified: 2026-06-19
libraries: []
source: docs/PLANS.md
note: Process skill — no library dependencies, no freshness check needed.
---

# /write-spec — Write a Product Spec

Triggered by: `/write-spec`

---

## Step 1 — Consult the Roadmap (if present)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null
```
If it exists, read it. Pick the first row with Status `NOT_STARTED` — the **walking skeleton** if
nothing is created yet, otherwise the next dependency-unblocked row (every spec in its `Depends On`
is already DRAFT or later). Use that row's Name, Epic, and Depends-On to pre-fill the spec's title
and the `**Epic:**` / `**Depends on:**` fields. If no roadmap exists, proceed ad hoc (a single
standalone spec).

## Step 2 — Get Next Spec Number
```bash
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort | tail -1
```
Increment by 1. If none exist, start at SPEC-001. (`ROADMAP.md` is CAPS, so the `grep SPEC-` never matches it.)

## Step 3 — Gather Intent
If the roadmap pre-filled the title / epic / dependencies, confirm them. Otherwise ask the human
ONE question if their description is too vague:
"What problem does this solve, and who experiences it?"
Do not ask for technical details — you'll derive those.

## Step 4 — Write the Spec

Save to: `docs/product-specs/draft/SPEC-XXX-{slug}.md`

```markdown
# SPEC-XXX — {Feature Name}

**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** — (assigned when READY)
**Epic:** —          <!-- from ROADMAP.md row, if roadmap-driven -->
**Depends on:** —    <!-- from ROADMAP.md row, if roadmap-driven -->

---

## Problem Statement
{1-3 sentences: what problem, who has it, why it matters}

---

## What We're Building
{2-4 sentences: the solution at a high level}

---

## Core Entities
| Entity | Purpose |
|---|---|
| {Entity} | {one line — becomes a Sequelize model + Zod schema} |

---

## API Endpoints
{List all endpoints: METHOD /path — description}

---

## Business Rules
{Numbered list of rules the system must enforce}

---

## State Machine (if applicable)
{ASCII diagram of state transitions}
{Transition rules}

---

## Non-Functional Requirements
{Performance, rate limits, auth requirements, coverage targets}

---

## Out of Scope (v1)
{What is explicitly NOT being built}

---

## Acceptance Criteria
- [ ] {Testable, specific criterion}
- [ ] {Each criterion maps to a test}
```

## Step 5 — Update Index + Roadmap
Add row to `docs/product-specs/index.md`:
`| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`

If this spec came from a `ROADMAP.md` row, flip that row in place: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 6 — Tell the Human
```
Spec written: docs/product-specs/draft/SPEC-XXX-{slug}.md
Status: DRAFT

Review it. When satisfied:
  1. Move to: docs/product-specs/ready/SPEC-XXX-{slug}.md
  2. Change Status: DRAFT → READY
  3. Run /write-plan

Claude will not create a plan until the spec is in ready/.
```
