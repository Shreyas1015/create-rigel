#!/usr/bin/env node
// evals/harness/score.mjs
//
// AC-6 scoring. A golden run is k trials of one spec, each a `trial-N.json`:
//   {
//     "trialId","specId","harnessCommit",
//     "status": "COMPLETE" | "ERRORED",        // ERRORED = budget abort / infra flake
//     "budget": { "tokenLimit", "tokensUsed", "aborted" },
//     "checks": { "AC-1":"PASS", "gate":"PASS", ... },   // deterministic per-check verdicts
//     "judgeAdvisories": { "intent":"PASS", ... }        // advisory only — never gate/score
//   }
//
// score() rolls the k trials into a per-check vector with pass^k. ERRORED trials are
// EXCLUDED from a check's pass/fail tally (budget aborts and infra flakes must never read
// as agent regressions — Anthropic's correlated-failure warning), so a check scored only
// from errored trials reports n=0, not a failure.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { allCheckIds, readJson, writeJson } from './lib/eval-lib.mjs'

export function scoreTrials(trials) {
  if (!trials.length) throw new Error('scoreTrials: no trials')
  const specId = trials[0].specId
  const k = trials.length
  const erroredTrials = trials.filter((t) => t.status === 'ERRORED').length

  const checks = {}
  for (const id of allCheckIds(trials.map((t) => t.checks ?? {}))) {
    let pass = 0
    let fail = 0
    let errored = 0
    for (const t of trials) {
      const v = (t.checks ?? {})[id]
      if (t.status === 'ERRORED' || v === 'ERRORED' || v === undefined) {
        errored++
        continue
      }
      if (v === 'PASS') pass++
      else fail++
    }
    const n = pass + fail
    checks[id] = {
      pass,
      fail,
      errored,
      n,
      passK: n > 0 && fail === 0, // pass^k over the non-errored trials
      passRate: n > 0 ? pass / n : null,
    }
  }

  return {
    specId,
    k,
    erroredTrials,
    harnessCommits: [...new Set(trials.map((t) => t.harnessCommit).filter(Boolean))],
    checks,
  }
}

export function loadRun(dir) {
  const files = readdirSync(dir)
    .filter((f) => /^trial-\d+\.json$/.test(f))
    .sort()
  return files.map((f) => readJson(join(dir, f)))
}

// ── CLI: node evals/harness/score.mjs evals/trials/<runId> ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: score.mjs <run-dir>')
    process.exit(2)
  }
  const scorecard = scoreTrials(loadRun(dir))
  writeJson(join(dir, 'scorecard.json'), scorecard)
  console.log(`Scorecard — ${scorecard.specId} (k=${scorecard.k}, errored trials=${scorecard.erroredTrials})`)
  for (const [id, c] of Object.entries(scorecard.checks)) {
    const tag = c.n === 0 ? 'NO-DATA (all errored)' : c.passK ? 'pass^k ✓' : `${c.pass}/${c.n} pass`
    console.log(`  ${id}: ${tag}`)
  }
}
