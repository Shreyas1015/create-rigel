#!/usr/bin/env node
// scripts/mutation-report.mjs
//
// AC-7 post-processor. Reads Stryker's JSON report and produces a per-AC mutation
// score, plus an overall score checked against the floor (60% — falsifier #3). This
// is a NIGHTLY ALARM: it never fails a build. It writes .rigel/mutation/summary.json;
// the workflow reads `breach` from it to decide whether to open an issue.
//
// Per-AC attribution: a mutant is credited to an AC when the test that killed it has
// that AC-id in its name (acceptance test titles carry their AC-id). A mutant killed
// only by non-AC tests, or not killed at all, counts against the "overall" score.

import { existsSync, readFileSync } from 'node:fs'
import { writeJson } from './lib/rigel-evals.mjs'

const FLOOR = 60 // percent — sustained breach opens an issue (see PLAN-003 falsifier #3)
const REPORT = 'reports/mutation/mutation.json'
const AC_ID = /\bAC-\d+\b/

if (!existsSync(REPORT)) {
  console.log(`mutation-report: no Stryker report at ${REPORT} — nothing to summarize (skipped).`)
  writeJson('.rigel/mutation/summary.json', { skipped: true, reason: 'no-report' })
  process.exit(0)
}

const report = JSON.parse(readFileSync(REPORT, 'utf8'))

// Build testId → AC-id map from the report's testFiles section (Stryker schema v1).
const testAc = new Map()
for (const tf of Object.values(report.testFiles ?? {})) {
  for (const t of tf.tests ?? []) {
    const m = (t.name ?? '').match(AC_ID)
    if (m) testAc.set(t.id, m[0])
  }
}

const DETECTED = new Set(['Killed', 'Timeout'])
const VALID = new Set(['Killed', 'Timeout', 'Survived', 'NoCoverage'])

let killed = 0
let valid = 0
const perAc = {} // AC-id → { detected, total }

for (const file of Object.values(report.files ?? {})) {
  for (const mut of file.mutants ?? []) {
    if (!VALID.has(mut.status)) continue // ignore CompileError / Ignored
    valid++
    const detected = DETECTED.has(mut.status)
    if (detected) killed++
    // Attribute to every AC whose test killed this mutant.
    const acs = new Set((mut.killedBy ?? []).map((id) => testAc.get(id)).filter(Boolean))
    for (const ac of acs) {
      perAc[ac] ??= { detected: 0, total: 0 }
      perAc[ac].detected++
    }
  }
}

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10)
const overall = pct(killed, valid)
const breach = valid > 0 && overall < FLOOR

const summary = {
  generatedAt: new Date().toISOString(),
  floor: FLOOR,
  overallScore: overall,
  killed,
  valid,
  breach,
  perAc: Object.fromEntries(
    Object.entries(perAc).map(([ac, v]) => [ac, { mutantsKilled: v.detected }]),
  ),
}
writeJson('.rigel/mutation/summary.json', summary)

console.log(`Mutation score: ${overall}% (${killed}/${valid} mutants detected) — floor ${FLOOR}%`)
for (const [ac, v] of Object.entries(perAc)) console.log(`  ${ac}: ${v.detected} mutants killed`)
console.log(breach ? `⚠️ FLOOR BREACH — below ${FLOOR}%` : `✅ above floor`)
// Exit 0 always — this is an alarm, not a gate. The workflow reads summary.json.
