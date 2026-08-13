// lib/grill.test.mjs — run: node lib/grill.test.mjs
//
// The value of this check is entirely in what it REFUSES. A version that passes a spec still full
// of guesses is worse than nothing: it would stamp "grilled" on exactly the specs that needed it.
import assert from 'node:assert/strict'
import { assess, parseQuestions, parseACs, record } from './grill.mjs'

const spec = ({ questions, acs, extra = '' }) => `# SPEC-001 — Thing

## Problem Statement
People cannot do the thing.

## Open Questions
${questions}

## Acceptance Criteria
${acs}
${extra}
`

const GOOD_Q = `| # | Question | Answer | Source |
|---|----------|--------|--------|
| Q1 | What happens on duplicate submit? | Reject with 409 | human |
| Q2 | Who may read another user's record? | Only admins | human |
| Q3 | Is the 30-day retention a hard requirement? | Yes, legal | human |`

const GOOD_AC = `- [ ] **AC-1:** POST /applications returns 201
- [ ] **AC-2:** duplicate submit returns 409`

// ── a fully resolved spec passes ──
{
  const r = assess(spec({ questions: GOOD_Q, acs: GOOD_AC }))
  assert.ok(r.ok, `should pass: ${r.problems.join('; ')}`)
  assert.equal(r.questions.length, 3)
  assert.equal(r.acs.length, 2)
  const rec = record('SPEC-001', r)
  assert.equal(rec.assumptionsRemaining, 0)
  assert.deepEqual(rec.acceptanceCriteria, ['AC-1', 'AC-2'])
}

// ── the section missing entirely is the default failure, not a pass ──
{
  const r = assess(`# SPEC-001\n\n## Acceptance Criteria\n${GOOD_AC}\n`)
  assert.equal(r.ok, false)
  assert.match(r.problems[0], /no "## Open Questions" section/)
}

// ── parked non-answers are not answers ──
for (const parked of ['TBD', 'todo', '?', '-', '—', 'N/A', 'none', 'unknown', 'later', '']) {
  const q = `| # | Question | Answer | Source |
|---|---|---|---|
| Q1 | Real one? | Yes | human |
| Q2 | Another? | Yes | human |
| Q3 | Parked? | ${parked} | — |`
  const r = assess(spec({ questions: q, acs: GOOD_AC }))
  assert.equal(r.ok, false, `"${parked}" must not count as an answer`)
  assert.ok(r.problems.some((p) => /Q3 is unanswered/.test(p)), `"${parked}": ${r.problems.join('; ')}`)
}

// ── an [ASSUMED] acceptance criterion cannot lock a holdout ──
{
  const acs = `- [ ] **AC-1:** POST /applications returns 201
- [ ] **AC-2:** [ASSUMED] rate limit is 100/min`
  const r = assess(spec({ questions: GOOD_Q, acs }))
  assert.equal(r.ok, false)
  assert.ok(r.problems.some((p) => /AC-2 is still marked \[ASSUMED\]/.test(p)), r.problems.join('; '))
}

// ── [ASSUMED] elsewhere (an NFR, an entity) is the same defect — it gets built as written ──
{
  const r = assess(spec({ questions: GOOD_Q, acs: GOOD_AC, extra: '\n## Non-Functional\nLatency [ASSUMED] < 200ms\n' }))
  assert.equal(r.ok, false)
  assert.ok(r.problems.some((p) => /outside the acceptance criteria/.test(p)), r.problems.join('; '))
}

// ── too few questions: a spec from a one-line brief has more unknowns than this ──
{
  const q = `| # | Question | Answer | Source |
|---|---|---|---|
| Q1 | Only one? | Yes | human |`
  const r = assess(spec({ questions: q, acs: GOOD_AC }))
  assert.equal(r.ok, false)
  assert.ok(r.problems.some((p) => /only 1 question/.test(p)), r.problems.join('; '))
}

// ── a spec with no ACs has nothing to hold out ──
{
  const r = assess(spec({ questions: GOOD_Q, acs: '(none yet)' }))
  assert.equal(r.ok, false)
  assert.ok(r.problems.some((p) => /no acceptance criteria/.test(p)))
}

// ── parsing tolerates the separator and header rows, and a missing Source column ──
{
  const rows = parseQuestions(`## Open Questions
| # | Question | Answer |
|:--|:---------|:-------|
| Q1 | a? | yes |
`)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'Q1')
  assert.equal(rows[0].answer, 'yes')
  assert.equal(rows[0].source, '')
}

// ── the Open Questions table must not swallow later sections ──
{
  const r = parseQuestions(`## Open Questions
| # | Question | Answer |
|---|---|---|
| Q1 | a? | yes |

## Core Entities
| Entity | Purpose |
|---|---|
| Order | a thing |
`)
  assert.equal(r.length, 1, 'rows from the next table must not leak in')
}

// ── ACs are found with checked or unchecked boxes ──
{
  const acs = parseACs('- [x] **AC-1:** done\n- [ ] **AC-2:** todo\n')
  assert.deepEqual(acs.map((a) => a.id), ['AC-1', 'AC-2'])
}

console.log('grill: all assertions passed')
