#!/usr/bin/env node
// evals/harness/regress.mjs
//
// AC-7 regression semantics. A check is REGRESSED only if BOTH hold:
//   (a) it fails in ≥2/3 of the current run's non-errored trials (replication — a single
//       flaky failure is not a regression), and
//   (b) it passed^k in the prior baseline (it actually got worse).
// ERRORED trials never count as failures (budget/infra ≠ agent regression).
//
// Output is an issue payload with transcript pointers and the METR rule stated verbatim:
// a human reads the transcript before the regression is believed.

import { join } from 'node:path'
import { readJson, writeJson } from './lib/eval-lib.mjs'

export function detectRegressions(current, baseline) {
  const k = current.k
  const minFailures = Math.ceil((2 / 3) * k) // ≥2/3 of trials
  const out = []
  for (const [id, c] of Object.entries(current.checks)) {
    const base = baseline?.checks?.[id]
    const replicatedFailure = c.fail >= minFailures
    const baselinePassed = base?.passK === true
    if (replicatedFailure && baselinePassed) {
      out.push({
        check: id,
        currentFail: c.fail,
        currentN: c.n,
        baselinePassRate: base.passRate,
      })
    }
  }
  return out
}

export function issuePayload(specId, regressions, current) {
  const title = `Golden regression: ${specId} — ${regressions.map((r) => r.check).join(', ')}`
  const lines = [
    `Golden-set run for **${specId}** (k=${current.k}) flagged ${regressions.length} regression(s):`,
    '',
    ...regressions.map(
      (r) => `- \`${r.check}\`: failed ${r.currentFail}/${r.currentN} trials now; baseline passed^k.`,
    ),
    '',
    '**Transcript pointers:** see the trial artifacts under `evals/trials/<runId>/` for this run',
    `(harness commit${current.harnessCommits.length ? ` ${current.harnessCommits.join(', ')}` : ''}).`,
    '',
    '> A human MUST read the trial transcript before this regression is believed (METR rule).',
    '> Flagged ≠ confirmed: the harness detects replicated worsening; a person confirms cause.',
  ]
  return { title, body: lines.join('\n'), labels: ['golden-regression'] }
}

// ── CLI: node evals/harness/regress.mjs <current-scorecard.json> <baseline-scorecard.json> ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [curPath, basePath] = process.argv.slice(2)
  if (!curPath || !basePath) {
    console.error('usage: regress.mjs <current-scorecard.json> <baseline-scorecard.json>')
    process.exit(2)
  }
  const current = readJson(curPath)
  const baseline = readJson(basePath)
  const regressions = detectRegressions(current, baseline)
  if (regressions.length === 0) {
    console.log(`No regressions for ${current.specId}.`)
    process.exit(0)
  }
  const payload = issuePayload(current.specId, regressions, current)
  const outPath = join(curPath, '..', 'regression-issue.json')
  writeJson(outPath, payload)
  console.log(payload.title)
  console.log(payload.body)
  console.error(`\n${regressions.length} regression(s) — issue payload written to ${outPath}`)
  process.exit(1)
}
