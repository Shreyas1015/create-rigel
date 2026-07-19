#!/usr/bin/env node
// evals/harness/calibrate.mjs
//
// AC-3 calibration. Computes agreement PER DIMENSION (never pooled) and decides which
// dimensions are promotion-eligible. Two calibration methods:
//
//   bootstrap — the dimension overlaps the deterministic AC vector, so the "reference"
//     label IS ground truth (PASS/FAIL from .rigel/ac-results). Judge-vs-reference κ alone
//     decides eligibility — no human labeling needed. This is the free calibration.
//
//   human — a judge-exclusive dimension (intent, abstraction, layout) with no deterministic
//     truth. Requires human labels. The rubric-validation PRE-STEP is human-vs-human κ:
//     if it can't be computed (solo — a single rater), the dimension is flagged
//     reduced-confidence and is NOT promotion-eligible (it stays advisory). We never
//     fabricate a κ from one rater.
//
// Calibration set shape (evals/calibration/sets/<name>.json):
//   {
//     "judgeModel": "opus", "generatedAt": "ISO",
//     "dimensions": {
//       "spec-judge/ac-conformance": { "method": "bootstrap", "severity": "normal",
//         "labels": [ { "judge": "PASS", "reference": "PASS" }, ... ] },
//       "spec-judge/intent": { "method": "human", "severity": "normal",
//         "labels": [ { "judge": "PASS", "reference": "FAIL", "human2": "FAIL" }, ... ] }
//     }
//   }
//   (reference = human rater #1 for human dims; human2 = the second rater, optional.)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { cohenKappa, readJson, writeJson } from './lib/eval-lib.mjs'

const RUBRIC_VALID_MIN = 0.4 // human-vs-human κ below this = the rubric is ambiguous
const SELF_PREF_CAVEAT =
  'Judge (opus) and builder (sonnet) are the same model family; self-preference is only partially mitigated.'

// Map an AC-vector status to a binary calibration reference label.
export function deterministicRefFromVector(status) {
  return status === 'PASS' ? 'PASS' : 'FAIL'
}

export function calibrate(set, thresholds = { default: 0.6, blockerSeverity: 0.8 }) {
  const out = {}
  for (const [dim, d] of Object.entries(set.dimensions)) {
    const labels = d.labels ?? []
    const judge = labels.map((l) => l.judge)
    const reference = labels.map((l) => l.reference)
    const jk = cohenKappa(judge, reference)
    const threshold = d.severity === 'blocker' ? thresholds.blockerSeverity : thresholds.default

    let humanHuman = null
    let reducedConfidence = false
    if (d.method === 'human') {
      const haveSecond = labels.length > 0 && labels.every((l) => l.human2 !== undefined)
      if (haveSecond) {
        humanHuman = cohenKappa(
          reference,
          labels.map((l) => l.human2),
        )
      } else {
        reducedConfidence = true // solo — rubric validation not established
      }
    }

    let promoteEligible = false
    if (!jk.degenerate && jk.kappa !== null && jk.kappa >= threshold) {
      if (d.method === 'bootstrap') promoteEligible = true
      else promoteEligible = humanHuman != null && humanHuman.kappa >= RUBRIC_VALID_MIN
    }

    out[dim] = {
      method: d.method,
      n: labels.length,
      threshold,
      judgeKappa: jk.kappa,
      judgeKappaDegenerate: jk.degenerate,
      humanHumanKappa: humanHuman ? humanHuman.kappa : null,
      rubricValid: humanHuman ? humanHuman.kappa >= RUBRIC_VALID_MIN : null,
      reducedConfidence,
      promoteEligible,
    }
  }
  return {
    generatedAt: set.generatedAt,
    judgeModel: set.judgeModel,
    judgeModelPinned: true,
    selfPreferenceCaveat: SELF_PREF_CAVEAT,
    rubricValidMin: RUBRIC_VALID_MIN,
    thresholds,
    dimensions: out,
  }
}

export function reportMarkdown(report) {
  const rows = Object.entries(report.dimensions).map(([dim, r]) => {
    const jk = r.judgeKappa == null ? 'n/a' : r.judgeKappa.toFixed(2)
    const hh = r.humanHumanKappa == null ? '—' : r.humanHumanKappa.toFixed(2)
    const note = r.reducedConfidence ? 'reduced-confidence (solo)' : r.judgeKappaDegenerate ? 'degenerate' : ''
    return `| ${dim} | ${r.method} | ${r.n} | ${jk} | ${hh} | ${r.threshold} | ${r.promoteEligible ? 'yes' : 'no'} | ${note} |`
  })
  return [
    `# Calibration report — ${report.generatedAt}`,
    '',
    `Judge model: **${report.judgeModel}** (pinned). ${report.selfPreferenceCaveat}`,
    `Rubric-valid floor (human-human κ): ${report.rubricValidMin}.`,
    '',
    '| dimension | method | n | judge κ | human-human κ | threshold | promote-eligible | note |',
    '|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

// ── CLI: node evals/harness/calibrate.mjs <calibration-set.json> ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const setPath = process.argv[2]
  if (!setPath) {
    console.error('usage: calibrate.mjs <calibration-set.json>')
    process.exit(2)
  }
  const set = readJson(setPath)
  const report = calibrate(set)
  const stamp = (set.generatedAt || 'undated').replace(/[:.]/g, '-')
  const base = join('evals', 'calibration', `REPORT-${stamp}`)
  writeJson(`${base}.json`, report)
  mkdirSync(dirname(`${base}.md`), { recursive: true })
  writeFileSync(`${base}.md`, reportMarkdown(report))
  console.log(reportMarkdown(report))
  console.log(`\nWritten: ${base}.json / ${base}.md`)
}
