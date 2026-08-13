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

## Impact

Run `npx create-rigel impact` first — it shows what in this repo depends on the files you'll
touch, and (from `knowledge/map/`) which services this app consumes. Then **declare your intent**:

```yaml
impact:
  touches: [OrderCard, orders-api]   # components / consumed APIs this feature changes
  breaking: false                    # do you intend to break an existing consumer?
  consumers_notified: []             # required when breaking: true — name them
  migrate: []                    # files this touches that sit outside Rigel's layers
```

This app **consumes** contracts; it does not publish one. So unlike the backend templates there is
no `oasdiff` breaking-change gate here to cross-check the declaration against — adding one would be
a check that verifies nothing. What the declaration buys you here is a written record of intent
that a reviewer and `create-rigel impact` can be read against, and `breaking: true` is your signal
that the **provider** repo owes a contract change first.

`contract:freshness` still blocks: if `openapi.json` moved and the generated types weren't
regenerated, the build is green against a contract the backend no longer serves.

`create-rigel impact` ends with a MIGRATION section naming the files this feature touches that
Rigel's layer rules and coverage thresholds do **not** govern. Listing one in `migrate:` makes moving
it part of this plan — Layer 0, before the feature work.

This is the only migration mechanism Rigel offers, and deliberately so. A "restructure the repo"
project does not get funded: teams already spend the bulk of their time on maintenance, and debt
accrues faster than it is paid down. A ground-up rewrite is worse still. Migrating a file *you are
already editing* is the one version that reliably happens — so the prompt appears exactly there, and
nowhere else. Leaving `migrate: []` is a normal answer; it goes to the tech-debt tracker.

Do not guess what you touch — read it off `create-rigel impact` and the components above.

## Business Rules (Frontend)
{Validation rules, state machine UI, conditional rendering}

## Non-Functional Requirements
{Performance targets, accessibility requirements, responsive breakpoints}

## Out of Scope (v1)

## Open Questions
{filled in at Step 3a — every question answered before the holdout locks}

---

## Acceptance Criteria
- [ ] **AC-1:** {testable, specific — one observable user-facing behavior}
- [ ] **AC-2:** {each criterion maps to exactly one acceptance test}
```

Every criterion **must** carry a stable `AC-N` id (`AC-1`, `AC-2`, …). These ids are the
traceability key: each becomes a failing acceptance test whose title contains the id, and the
gate grades the spec by them. Number them sequentially; never renumber once written.

## Step 3a — Grill the spec BEFORE the holdout closes

Everything in Step 3b turns each `AC-N` into a file in `tests/acceptance/SPEC-XXX/` that the
post-write hook then refuses to let anyone edit. So this step is the last moment where changing your
mind is free. After it, a wrong requirement costs a plan and a sprint.

You have just written entities, endpoints, business rules, NFRs and acceptance criteria. The human
gave you a few sentences. **Most of what you wrote, you inferred.** Separate the two now.

Add an `## Open Questions` section to the spec, immediately before `## Acceptance Criteria`:

```markdown
## Open Questions

| # | Question | Answer | Source |
|---|----------|--------|--------|
| Q1 | What should happen on a duplicate submit? | Reject with 409 | human |
| Q2 | Who may read another user's record? | Only admins | human |
| Q3 | Is 30-day retention a hard requirement or a guess? | Legal requirement | human |
```

**Mark every guess.** Anywhere in the spec you wrote something the human did not tell you — an
entity, a rate limit, a status code, an AC — append `[ASSUMED]` to it. Then ask about each one.

Ask about what is **expensive to get wrong**, not what is easy to ask:

- **Behaviour at the edges** — duplicates, concurrent writes, partial failure, empty states.
  Happy-path ACs are rarely wrong; edge ACs are where invented requirements hide.
- **Authorization** — who may do this to whose data? Guessing this produces a security bug that
  passes every test you wrote, because you wrote the tests from the same wrong assumption.
- **Numbers you invented** — every limit, timeout, page size and retention period. If the human
  did not say `100/min`, you made it up, and it will be enforced as if they had.
- **Anything irreversible** — deletes, emails, payments, external calls.
- **Scope boundaries** — the "Out of Scope (v1)" list is a set of decisions, not filler.

Then run:

```bash
npm run grill:record -- SPEC-XXX
```

It **refuses** to record while any question is unanswered or any `[ASSUMED]` marker remains. Parked
answers do not count — `TBD`, `?`, `-` and `N/A` are open questions wearing a hat. Deleting an
`[ASSUMED]` line is a perfectly good resolution; shipping it is not.

Do not proceed to Step 3b until this passes. `/write-plan` will refuse the spec without
`.rigel/grill/SPEC-XXX.json`, so skipping it only moves the failure later, when it costs more.

---

## Step 3b — Scaffold Failing Acceptance Tests (the holdout)

`tests/acceptance/` is a **holdout**: the post-write hook blocks edits there outside this spec
phase, so it may only be written now, under the unlock marker. For the spec you just wrote:

```bash
mkdir -p .rigel
touch .rigel/acceptance.unlock          # unlock the holdout for scaffolding
mkdir -p tests/acceptance/SPEC-XXX
```

For **every** `AC-N` in the spec, write one test file
`tests/acceptance/SPEC-XXX/AC-N.test.tsx` whose test title **starts with the AC-id**. Use the
frontend testing stack (Vitest + Testing Library + MSW) and assert the REAL intended behavior,
so it fails for the RIGHT reason before the feature exists — never a placeholder like
`expect(false)` or `expect(true).toBe(true)` (the assertion-integrity gate rejects those):

```tsx
// tests/acceptance/SPEC-XXX/AC-1.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
// The feature component does not exist yet — this import (or the behavior below) is what
// makes the test RED pre-implementation. Point it at where the feature WILL live.
import { ApplicationForm } from '@/features/applications/application-form'

describe('AC-1: user can create an application', () => {
  it('AC-1: submitting the form shows the created application', async () => {
    server.use(
      http.post('*/api/v1/applications', () =>
        HttpResponse.json({ data: { id: 'app_1', company: 'Acme' } }, { status: 201 }),
      ),
    )
    render(<ApplicationForm />, { wrapper: createWrapper() })
    await userEvent.type(screen.getByLabelText(/company/i), 'Acme')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))
    // Assert the real success behavior — the created record surfaces in the UI.
    expect(await screen.findByText('Acme')).toBeInTheDocument()
  })
})
```

Rules for each scaffolded test:
- The title contains the `AC-N` id (this is how the gate maps test→AC).
- It asserts the **real** behavior the AC describes (rendered output, a11y role/label, MSW-backed
  data), so it fails pre-implementation — not `expect(false)`, not a snapshot, not
  `expect(true).toBe(true)`.

Then close the holdout and record the red-green proof:

```bash
rm -f .rigel/acceptance.unlock          # re-lock the holdout
npm run redgreen:record -- SPEC-XXX     # requires ALL acceptance tests to fail now
```

`redgreen:record` runs the acceptance suite via `vitest.acceptance.config.ts` and refuses to
proceed if any acceptance test passes before implementation (a test that already passes proves
nothing). It writes `.rigel/redgreen/SPEC-XXX.json`. If it fails, fix the offending test so it
genuinely asserts unbuilt behavior, then re-run it.

**Always remove `.rigel/acceptance.unlock` when done** — leaving it in place would defeat the
holdout. If any step above errors out, still run `rm -f .rigel/acceptance.unlock`.

## Step 4 — Update Index + Roadmap
Add to `docs/product-specs/index.md`: `| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`
If this spec came from a `ROADMAP.md` row, flip that row: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 5 — Tell the Human
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
