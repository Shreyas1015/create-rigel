// lib/decisions.test.mjs — run: node lib/decisions.test.mjs
//
// Two properties carry this: coverage must be DERIVED (so it cannot be quietly skipped), and the
// count must stay proportional to the spec (so it never becomes the checklist people switch off).
import assert from 'node:assert/strict'
import { parseEndpoints, parseEntities, requiredDecisions, checkDesign } from './decisions.mjs'

const spec = (endpoints, entities = '') => `# SPEC-001 — Thing

## Core Entities
| Entity | Purpose |
|---|---|
${entities}

## API Endpoints
${endpoints}

## Acceptance Criteria
- [ ] **AC-1:** x
`

// ── parsing ──
{
  const md = spec('- POST /api/v1/applications — create\n- GET /api/v1/applications/:id — read\n',
                  '| Application | a submission |\n| User | a person |')
  assert.deepEqual(parseEndpoints(md).map((e) => e.label), ['POST /api/v1/applications', 'GET /api/v1/applications/:id'])
  assert.deepEqual(parseEntities(md).map((e) => e.name), ['Application', 'User'])
}

// ── the unfilled template row must not count as an entity ──
{
  const md = spec('- GET /x — read', '| {Entity} | {one line} |')
  assert.deepEqual(parseEntities(md), [], 'placeholder rows are not entities')
}

// ── proportionality: a read-only spec owes 2 decisions, not 5 ──
{
  const md = spec('- GET /items — list\n- GET /items/:id — read')
  const req = requiredDecisions(md).map((r) => r.id)
  assert.deepEqual(req.sort(), ['authorization', 'rate-limiting'], `read-only spec owes: ${req}`)
}

// ── a full CRUD spec with entities owes all five, and no more ──
{
  const md = spec('- POST /items — create\n- GET /items — list\n- DELETE /items/:id — remove',
                  '| Item | a thing |')
  const req = requiredDecisions(md)
  assert.equal(req.length, 5, `expected 5, got ${req.map((r) => r.id)}`)
  // ten endpoints still owe ONE authorization decision, not ten
  const many = spec(Array.from({ length: 10 }, (_, i) => `- POST /r${i} — x`).join('\n'), '| Item | a thing |')
  assert.equal(requiredDecisions(many).length, 5, 'triggers are categories, not per-item')
  assert.equal(requiredDecisions(many)[0].triggeredBy.length, 10, 'but they name what fired them')
}

// ── a spec with no endpoints and no entities owes nothing ──
assert.deepEqual(requiredDecisions('# SPEC-002\n\n## Problem Statement\nx\n'), [])

// ── coverage: a missing decision fails, and names the trigger ──
{
  const required = requiredDecisions(spec('- POST /items — create', '| Item | a thing |'))
  const r = checkDesign({
    decisions: [{ id: 'DD-1', covers: ['authorization'], decision: 'owner-only', because: 'x', rejected: ['public'] }],
    required,
  })
  assert.equal(r.ok, false)
  const missing = r.problems.filter((p) => p.kind === 'coverage').map((p) => p.id).sort()
  assert.deepEqual(missing, ['data-retention', 'failure-handling', 'idempotency', 'rate-limiting'])
  assert.match(r.problems.find((p) => p.id === 'idempotency').detail, /POST \/items/)
}

// ── rejected: must be non-empty ──
for (const rejected of [undefined, [], [''], ['   ']]) {
  const r = checkDesign({
    decisions: [{ id: 'DD-1', covers: ['authorization'], decision: 'x', because: 'y', rejected }],
    required: [],
  })
  assert.ok(r.problems.some((p) => p.kind === 'rejected'), `rejected=${JSON.stringify(rejected)} must fail`)
}

// ── a fully covered design passes ──
{
  const required = requiredDecisions(spec('- GET /items — list'))
  const r = checkDesign({
    decisions: [
      { id: 'DD-1', covers: ['authorization'], decision: 'owner-only', because: 'tenanted', rejected: ['public'] },
      { id: 'DD-2', covers: ['rate-limiting'], decision: '100/min per user', because: 'ops', rejected: ['none'] },
    ],
    required,
  })
  assert.ok(r.ok, JSON.stringify(r.problems))
  assert.equal(r.decided, 2)
  assert.equal(r.observed, 0)
}

// ── brownfield: `observed` needs no rationale, but still needs alternatives ──
{
  const r = checkDesign({
    decisions: [{ id: 'DD-1', covers: ['authorization'], decision: 'route-level check', status: 'observed', rejected: ['repo-level — not how it is written today'] }],
    required: [],
  })
  assert.ok(r.ok, JSON.stringify(r.problems))
  assert.equal(r.observed, 1)

  const bad = checkDesign({ decisions: [{ id: 'DD-1', covers: [], decision: 'x', status: 'guessed', rejected: ['y'] }], required: [] })
  assert.ok(bad.problems.some((p) => p.kind === 'status'))
}

// ── citations are only checked when a corpus resolved; skipping is the caller's to report ──
{
  const d = [{ id: 'DD-1', covers: [], decision: 'x', because: 'y', rejected: ['z'], standard: 'made-up.md#nope' }]
  assert.ok(checkDesign({ decisions: d, required: [] }).ok, 'no resolver → citation not checked')
  const withResolver = checkDesign({
    decisions: d, required: [],
    resolveRef: () => ({ ok: false, reason: 'no such note', suggestion: 'idempotency.md' }),
  })
  assert.ok(withResolver.problems.some((p) => p.kind === 'standard'))
  assert.match(withResolver.problems.find((p) => p.kind === 'standard').detail, /did you mean: idempotency\.md/)
}

console.log('decisions: all assertions passed')

// ── the design-file parser ───────────────────────────────────────────────────────
// Strictness is the point: a lenient parser that skipped a line it did not understand would drop a
// `rejected:` block and pass the decision — a false green from the component whose job is refusing.
import { parseDesign } from './decisions.mjs'

{
  const { decisions, errors } = parseDesign(`# design for SPEC-001

- id: DD-1
  covers: [authorization]
  decision: Owner-only reads, admins may read any
  because: Applications contain personal data
  rejected:
    - Public reads — leaks candidate data
    - Any authenticated user — same leak, smaller blast radius
  standard: authorization.md#object-level-authorization
  status: decided

- id: DD-2
  covers: [idempotency, failure-handling]
  decision: Idempotency-Key with a 24h window
  because: Mobile clients retry
  rejected:
    - Natural-key dedupe — candidates legitimately re-apply
  status: decided
`)
  assert.deepEqual(errors, [], `unexpected: ${errors}`)
  assert.equal(decisions.length, 2)
  assert.equal(decisions[0].id, 'DD-1')
  assert.deepEqual(decisions[0].covers, ['authorization'])
  assert.equal(decisions[0].rejected.length, 2, 'block list must be captured in full')
  assert.match(decisions[0].rejected[0], /^Public reads/)
  assert.equal(decisions[0].standard, 'authorization.md#object-level-authorization')
  assert.deepEqual(decisions[1].covers, ['idempotency', 'failure-handling'])
}

// ── an unknown field is an ERROR, never silently ignored ──
{
  const { errors } = parseDesign('- id: DD-1\n  desicion: typo\n  rejected: [a]\n')
  assert.equal(errors.length, 1)
  assert.match(errors[0], /unknown field "desicion"/)
}

// ── junk that is not a field must not be swallowed ──
{
  const { errors } = parseDesign('- id: DD-1\n  rejected: [a]\n  this line is prose\n')
  assert.ok(errors.some((e) => /cannot parse/.test(e)), errors.join('; '))
}

// ── a list item before any list is an error, not a lost line ──
{
  const { errors } = parseDesign('- id: DD-1\n  decision: x\n    - orphan\n')
  assert.ok(errors.some((e) => /list item outside a list/.test(e)), errors.join('; '))
}

// ── comments and blank lines are fine ──
{
  const { decisions, errors } = parseDesign('# a comment\n\n- id: DD-1\n  # inline note\n  decision: x\n  rejected: [y]\n')
  assert.deepEqual(errors, [])
  assert.equal(decisions.length, 1)
}

// ── quoted values keep their content, including colons ──
{
  const { decisions } = parseDesign('- id: DD-1\n  decision: "Retry: 3 attempts, jittered"\n  rejected: [none]\n')
  assert.equal(decisions[0].decision, 'Retry: 3 attempts, jittered')
}

console.log('decisions: parser assertions passed')
