#!/usr/bin/env node
// evals/harness/champion.mjs
//
// AC-8 champion/challenger. Compares two harness commits (baseline vs candidate) run on the
// SAME golden specs, SAME trial count, SAME night. Pairs outcomes at the trial level
// (baseline trial i vs candidate trial i, per spec+check), takes per-pair deltas
// (candidate pass − baseline pass ∈ {−1,0,+1}), and runs a two-sided SIGN TEST over the
// non-zero deltas. Provenance (harness commit) is recorded per arm. Output: a
// block / review / deploy recommendation — never an automatic action.
//
// Deliberately conservative: a single-pair or unreplicated difference won't clear the sign
// test; ERRORED outcomes are dropped from pairing (infra ≠ signal), per HOB's warning not to
// over-interpret single pairs.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, signTest } from './lib/eval-lib.mjs'

const passVal = (v) => (v === 'PASS' ? 1 : v === 'FAIL' ? 0 : null) // ERRORED/undefined → null (skip)

// Group trials by spec, preserving order (order = trial index for pairing).
function bySpec(run) {
  const m = new Map()
  for (const t of run) {
    if (!m.has(t.specId)) m.set(t.specId, [])
    m.get(t.specId).push(t)
  }
  return m
}

export function champion(baselineRun, candidateRun) {
  const base = bySpec(baselineRun)
  const cand = bySpec(candidateRun)
  const deltas = []
  const perCheck = {} // "spec/check" -> { sum, n }

  for (const [specId, bTrials] of base) {
    const cTrials = cand.get(specId) ?? []
    const k = Math.min(bTrials.length, cTrials.length)
    for (let i = 0; i < k; i++) {
      // An ERRORED trial on either arm voids the whole pair (infra ≠ signal).
      if (bTrials[i].status === 'ERRORED' || cTrials[i].status === 'ERRORED') continue
      const bc = bTrials[i].checks ?? {}
      const cc = cTrials[i].checks ?? {}
      const checks = new Set([...Object.keys(bc), ...Object.keys(cc)])
      for (const check of checks) {
        const bv = passVal(bc[check])
        const cv = passVal(cc[check])
        if (bv === null || cv === null) continue // an errored side → not a pair
        const d = cv - bv
        deltas.push(d)
        const key = `${specId}/${check}`
        perCheck[key] ??= { sum: 0, n: 0 }
        perCheck[key].sum += d
        perCheck[key].n++
      }
    }
  }

  const test = signTest(deltas)
  let recommendation
  if (!test.significant) recommendation = 'REVIEW' // no clear signal
  else if (test.direction === 'down') recommendation = 'BLOCK' // candidate significantly worse
  else recommendation = 'DEPLOY' // candidate significantly better

  return {
    recommendation,
    signTest: test,
    pairedDeltas: deltas.length,
    perCheck,
    provenance: {
      baseline: [...new Set(baselineRun.map((t) => t.harnessCommit).filter(Boolean))],
      candidate: [...new Set(candidateRun.map((t) => t.harnessCommit).filter(Boolean))],
    },
  }
}

function loadRun(dir) {
  return readdirSync(dir)
    .filter((f) => /^trial-\d+\.json$/.test(f))
    .sort()
    .map((f) => readJson(join(dir, f)))
}

// ── CLI: node evals/harness/champion.mjs <baseline-run-dir> <candidate-run-dir> ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [baseDir, candDir] = process.argv.slice(2)
  if (!baseDir || !candDir) {
    console.error('usage: champion.mjs <baseline-run-dir> <candidate-run-dir>')
    process.exit(2)
  }
  const res = champion(loadRun(baseDir), loadRun(candDir))
  console.log(`Champion/challenger — recommendation: ${res.recommendation}`)
  console.log(
    `  paired deltas=${res.pairedDeltas}  direction=${res.signTest.direction}  p=${res.signTest.pValue.toFixed(4)}  (+${res.signTest.pos}/−${res.signTest.neg})`,
  )
  console.log(`  baseline=${res.provenance.baseline.join(',')}  candidate=${res.provenance.candidate.join(',')}`)
  for (const [k, v] of Object.entries(res.perCheck)) {
    if (v.sum !== 0) console.log(`    ${k}: net ${v.sum > 0 ? '+' : ''}${v.sum} over ${v.n} pairs`)
  }
  // Exit non-zero only on a BLOCK recommendation so a CI challenger job can fail loudly.
  process.exit(res.recommendation === 'BLOCK' ? 1 : 0)
}
