// lib/grill.mjs — PLAN-022. A spec may not lock its holdout while it is still guessing.
//
// WHERE THE MONEY IS. `/write-spec` asks the human "ONE question if their description is too
// vague", then writes the entities, endpoints, business rules, NFRs and acceptance criteria. Those
// ACs immediately become `tests/acceptance/SPEC-XXX/` — a HOLDOUT the post-write hook refuses to
// let anyone edit afterwards, with a recorded red-green proof. So an invented requirement does not
// stay a paragraph: within one skill run it becomes a locked test, a plan, and a sprint of work.
//
// That makes the moment *before* the holdout closes the cheapest point in the whole pipeline to be
// wrong, and the last one where being wrong is nearly free.
//
// WHAT THIS ENFORCES, AND WHAT IT CANNOT. It cannot check that the agent asked *good* questions —
// no script can. What it can do is refuse to let a guess pass silently: every assumption must be
// written down as `[ASSUMED]`, and every one must be resolved before the holdout locks. The agent
// is instructed to mark its guesses; this makes the marks BLOCKING rather than decorative, which is
// the only difference between a convention and a rule.
//
// The doctrine is the spec's own `breaking:` field: declaring is cheap, over-declaring is free, and
// the only thing that costs you is staying quiet. Same shape as `redgreen:record`, which refuses a
// proof where a test already passed — a record that cannot fail proves nothing.

/** Answers that are not answers. A question parked with "TBD" is an open question wearing a hat. */
const EMPTY_ANSWER = /^(|-+|—|tbd|todo|\?+|n\/?a|none|unknown|later|\.\.\.)$/i

export const ASSUMED_RE = /\[ASSUMED\]/g

/**
 * Pull the Open Questions table out of a spec.
 * Expected shape (markdown table, any column order tolerated as long as the headers match):
 *
 *   | # | Question | Answer | Source |
 *   |---|----------|--------|--------|
 *   | Q1 | What happens on a duplicate submit? | Reject with 409 | human |
 */
export function parseQuestions(md) {
  const section = sectionOf(md, 'Open Questions')
  if (section === null) return null // the section is absent entirely — distinct from "present but empty"

  const rows = []
  for (const line of section.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const cells = t.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3) continue
    if (/^-+$/.test(cells[0].replace(/[:\s]/g, ''))) continue // separator row
    if (/^#$/.test(cells[0]) || /^question$/i.test(cells[1])) continue // header row
    rows.push({ id: cells[0], question: cells[1], answer: cells[2], source: cells[3] ?? '' })
  }
  return rows
}

/** The `- [ ] **AC-N:** …` lines, with whether each still carries an [ASSUMED] mark. */
export function parseACs(md) {
  const out = []
  for (const m of md.matchAll(/^\s*-\s*\[[ xX]\]\s*\*\*(AC-\d+):\*\*\s*(.*)$/gm)) {
    out.push({ id: m[1], text: m[2].trim(), assumed: /\[ASSUMED\]/.test(m[2]) })
  }
  return out
}

function sectionOf(md, heading) {
  const re = new RegExp(`^#{1,4}\\s+${heading}\\s*$`, 'im')
  const m = re.exec(md)
  if (!m) return null
  const rest = md.slice(m.index + m[0].length)
  const next = /^#{1,4}\s+\S/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/**
 * Can this spec close its holdout?
 * @returns {{ok, problems: string[], questions, acs, assumedCount}}
 */
export function assess(md, { minQuestions = 3 } = {}) {
  const problems = []
  const questions = parseQuestions(md)
  const acs = parseACs(md)
  const assumedCount = (md.match(ASSUMED_RE) ?? []).length

  if (questions === null) {
    problems.push(
      `no "## Open Questions" section — every spec has unknowns, and a spec claiming none has hidden them rather than resolved them`,
    )
  } else {
    if (questions.length < minQuestions) {
      problems.push(
        `only ${questions.length} question(s) recorded; at least ${minQuestions} expected. ` +
          `A spec written from a one-line brief has more than ${minQuestions} unknowns — find them now, not in review`,
      )
    }
    for (const q of questions) {
      if (EMPTY_ANSWER.test(q.answer)) {
        problems.push(`${q.id || '(unnumbered)'} is unanswered ("${q.answer || 'empty'}"): ${q.question}`)
      }
    }
  }

  if (!acs.length) problems.push(`no acceptance criteria found — nothing to hold out`)
  for (const ac of acs.filter((a) => a.assumed)) {
    problems.push(`${ac.id} is still marked [ASSUMED] — confirm it or cut it before it becomes a locked test`)
  }

  // An [ASSUMED] anywhere else in the spec (an entity, an NFR, a business rule) is the same defect:
  // it will be built as written.
  const loose = assumedCount - acs.filter((a) => a.assumed).length
  if (loose > 0) {
    problems.push(`${loose} unresolved [ASSUMED] marker(s) outside the acceptance criteria — resolve or delete each`)
  }

  return { ok: problems.length === 0, problems, questions: questions ?? [], acs, assumedCount }
}

/** The record written on success — the artifact `/write-plan` later insists on. */
export function record(spec, r) {
  return {
    spec,
    grilledAt: new Date().toISOString(),
    questions: r.questions.map(({ id, question, answer, source }) => ({ id, question, answer, source })),
    acceptanceCriteria: r.acs.map((a) => a.id),
    assumptionsRemaining: 0,
  }
}
