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
- [ ] **AC-1:** {Testable, specific criterion — one observable behavior}
- [ ] **AC-2:** {Each criterion maps to exactly one acceptance test}
```

Every criterion **must** carry a stable `AC-N` id (`AC-1`, `AC-2`, …). These ids are the
traceability key: each becomes a failing acceptance test whose title contains the id, and the
gate grades the spec by them. Number them sequentially; never renumber once written.

## Step 4b — Scaffold Failing Acceptance Tests (the holdout)

`tests/acceptance/` is a **holdout**: the post-write hook blocks edits there outside this spec
phase, so it may only be written now, under the unlock marker. For the spec you just wrote:

```bash
mkdir -p .rigel
touch .rigel/acceptance.unlock          # unlock the holdout for scaffolding
mkdir -p tests/acceptance/SPEC-XXX
```

For **every** `AC-N` in the spec, write one test file
`tests/acceptance/SPEC-XXX/AC-N.test.ts` whose test title **starts with the AC-id**, e.g.:

```typescript
// tests/acceptance/SPEC-XXX/AC-1.test.ts
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'

describe('AC-1: user can create an application', () => {
  it('AC-1: POST /api/v1/applications returns 201 with the created record', async () => {
    // Assert the REAL intended behavior. It must FAIL now (endpoint/behavior does not
    // exist yet) — that is the red-green proof. Never write a placeholder like
    // expect(false) or expect(true); assert what "done" actually looks like.
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${'<test-token>'}`)
      .send({ company: 'Acme', role: 'Engineer' })
    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty('id')
  })
})
```

Rules for each scaffolded test:
- The title contains the `AC-N` id (this is how the gate maps test→AC).
- It asserts the **real** behavior the AC describes, so it fails for the RIGHT reason before
  implementation — not `expect(false)`, not a snapshot, not `expect(true).toBe(true)` (the
  assertion-integrity gate rejects those).

Then close the holdout and record the red-green proof:

```bash
rm -f .rigel/acceptance.unlock          # re-lock the holdout
npm run redgreen:record -- SPEC-XXX     # requires ALL acceptance tests to fail now
```

`redgreen:record` refuses to proceed if any acceptance test passes before implementation (a test
that already passes proves nothing). It writes `.rigel/redgreen/SPEC-XXX.json`. If it fails,
fix the offending test so it genuinely asserts unbuilt behavior, then re-run it.

**Always remove `.rigel/acceptance.unlock` when done** — leaving it in place would defeat the
holdout. If any step above errors out, still run `rm -f .rigel/acceptance.unlock`.

## Step 5 — Update Index + Roadmap
Add row to `docs/product-specs/index.md`:
`| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`

If this spec came from a `ROADMAP.md` row, flip that row in place: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 6 — Tell the Human
```
Spec written:      docs/product-specs/draft/SPEC-XXX-{slug}.md   (Status: DRAFT)
Acceptance tests:  tests/acceptance/SPEC-XXX/  (N tests, all red — proof recorded)

Review it. When satisfied:
  1. Move to: docs/product-specs/ready/SPEC-XXX-{slug}.md
  2. Change Status: DRAFT → READY
  3. Run /write-plan

A spec may not go DRAFT → READY until its acceptance tests exist and their red-green
proof is recorded (.rigel/redgreen/SPEC-XXX.json) — /write-plan enforces this and
refuses to plan a spec that lacks them. Claude will not create a plan until the spec is
in ready/.
```
