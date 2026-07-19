// evals/harness/score.test.mjs — run: node evals/harness/score.test.mjs
// Covers AC-6 scoring (pass^k, ERRORED≠FAILED) and AC-7 regression semantics via the
// committed planted-regression fixtures + in-memory edge cases.
import assert from 'node:assert/strict'
import { detectRegressions } from './regress.mjs'
import { loadRun, scoreTrials } from './score.mjs'

// ── AC-7 tamper test: baseline (all green) vs planted (AC-2 regressed, gate flaky) ──
{
  const baseline = scoreTrials(loadRun('evals/trials/fixtures/baseline'))
  const current = scoreTrials(loadRun('evals/trials/fixtures/planted'))

  assert.equal(baseline.checks['AC-2'].passK, true)
  assert.equal(current.checks['AC-2'].fail, 2) // failed 2/3
  assert.equal(current.checks['gate'].fail, 1) // flaky 1/3

  const regs = detectRegressions(current, baseline).map((r) => r.check)
  assert.deepEqual(regs, ['AC-2'], `expected only AC-2 flagged, got ${regs}`)
  assert.ok(!regs.includes('gate'), 'a 1/3 flaky failure must NOT be flagged (needs ≥2/3)')
  assert.ok(!regs.includes('AC-1'), 'a passing check must not be flagged')
}

// ── ERRORED ≠ FAILED: a check errored in all trials → n=0, not a regression ──
{
  const trials = [
    { specId: 'X', status: 'ERRORED', checks: { 'AC-1': 'PASS' } },
    { specId: 'X', status: 'ERRORED', checks: { 'AC-1': 'PASS' } },
    { specId: 'X', status: 'COMPLETE', checks: { 'AC-1': 'PASS' } },
  ]
  const sc = scoreTrials(trials)
  assert.equal(sc.checks['AC-1'].errored, 2)
  assert.equal(sc.checks['AC-1'].n, 1) // only the COMPLETE trial counts
  assert.equal(sc.erroredTrials, 2)

  // A per-check ERRORED value is excluded too.
  const sc2 = scoreTrials([
    { specId: 'X', status: 'COMPLETE', checks: { gate: 'ERRORED' } },
    { specId: 'X', status: 'COMPLETE', checks: { gate: 'ERRORED' } },
    { specId: 'X', status: 'COMPLETE', checks: { gate: 'ERRORED' } },
  ])
  assert.equal(sc2.checks['gate'].n, 0)
  assert.equal(sc2.checks['gate'].passK, false) // no data ≠ pass, but…
  const noBaselineRegs = detectRegressions(sc2, { checks: { gate: { passK: true } } })
  assert.deepEqual(noBaselineRegs, [], 'all-errored check must not be a regression (0 real failures)')
}

// ── already-failing-in-baseline is NOT a regression (didn't get worse) ──
{
  const current = scoreTrials([
    { specId: 'X', status: 'COMPLETE', checks: { 'AC-9': 'FAIL' } },
    { specId: 'X', status: 'COMPLETE', checks: { 'AC-9': 'FAIL' } },
    { specId: 'X', status: 'COMPLETE', checks: { 'AC-9': 'PASS' } },
  ])
  const baseline = { checks: { 'AC-9': { passK: false, passRate: 0.3 } } }
  assert.deepEqual(detectRegressions(current, baseline), [], 'baseline never passed → not a regression')
}

console.log('score + regress: all assertions passed')
