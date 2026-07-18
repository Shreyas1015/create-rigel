# /write-spec
1. Get next number: ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep SPEC | sort | tail -1
2. Write to docs/product-specs/draft/SPEC-XXX-{slug}.md

Template:
```markdown
# SPEC-XXX — {Name}
**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** —

## Problem Statement
## What We're Building
## Core Entities
## API Endpoints (will map to NestJS controllers)
## Business Rules
## State Machines (if any)
## Non-Functional Requirements
## Out of Scope (v1)
## Acceptance Criteria
- [ ] **AC-1:** {Testable, specific criterion — one observable behavior}
- [ ] **AC-2:** {Each criterion maps to exactly one acceptance test}
```

Every criterion **must** carry a stable `AC-N` id (`AC-1`, `AC-2`, …). These ids are the
traceability key: each becomes a failing acceptance test whose title contains the id, and the
gate grades the spec by them. Number them sequentially; never renumber once written.

## Step 2b — Scaffold Failing Acceptance Tests (the holdout)

`tests/acceptance/` is a **holdout**: the post-write hook blocks edits there outside this spec
phase (exit 2), so it may only be written now, under the unlock marker. For the spec you just wrote:

```bash
mkdir -p .rigel
touch .rigel/acceptance.unlock          # unlock the holdout for scaffolding
mkdir -p tests/acceptance/SPEC-XXX
```

For **every** `AC-N` in the spec, write one test file
`tests/acceptance/SPEC-XXX/AC-N.test.ts` whose test title **starts with the AC-id**, e.g.:

```typescript
// tests/acceptance/SPEC-XXX/AC-1.test.ts
import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import { AppModule } from '../../../src/app.module'

describe('AC-1: user can create an application', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
  })

  it('AC-1: POST /applications returns 201 with the created record', async () => {
    // Assert the REAL intended behavior. It must FAIL now (endpoint/behavior does not
    // exist yet) — that is the red-green proof. Never write a placeholder like
    // expect(false) or expect(true); assert what "done" actually looks like.
    const res = await request(app.getHttpServer())
      .post('/applications')
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
  `tests/architecture/assertion-integrity.test.ts` gate rejects those).

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

## Step 3 — Update Index + Tell the Human
3. Update docs/product-specs/index.md
4. Tell human:
```
Spec written:      docs/product-specs/draft/SPEC-XXX-{slug}.md   (Status: DRAFT)
Acceptance tests:  tests/acceptance/SPEC-XXX/  (N tests, all red — proof recorded)

Move to ready/ and change Status to READY, then run /write-plan.

A spec may not go DRAFT → READY until its acceptance tests exist and their red-green
proof is recorded (.rigel/redgreen/SPEC-XXX.json) — /write-plan enforces this and
refuses to plan a spec that lacks them.
```
