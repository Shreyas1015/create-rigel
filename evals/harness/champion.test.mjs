// evals/harness/champion.test.mjs — run: node evals/harness/champion.test.mjs
import assert from 'node:assert/strict'
import { champion } from './champion.mjs'

const trial = (specId, commit, checks, status = 'COMPLETE') => ({ specId, harnessCommit: commit, status, checks })
const rep = (checks, commit) => [1, 2, 3].map(() => trial('S', commit, checks))

// ── candidate significantly WORSE on 2 checks × 3 trials = 6 negatives → BLOCK ──
{
  const base = rep({ 'AC-1': 'PASS', 'AC-2': 'PASS', gate: 'PASS' }, 'baseA')
  const cand = rep({ 'AC-1': 'FAIL', 'AC-2': 'FAIL', gate: 'PASS' }, 'candB')
  const r = champion(base, cand)
  assert.equal(r.signTest.direction, 'down')
  assert.ok(r.signTest.significant, `p=${r.signTest.pValue}`)
  assert.equal(r.recommendation, 'BLOCK')
  assert.deepEqual(r.provenance, { baseline: ['baseA'], candidate: ['candB'] })
  assert.equal(r.perCheck['S/AC-1'].sum, -3)
}

// ── candidate significantly BETTER → DEPLOY ──
{
  const base = rep({ 'AC-1': 'FAIL', 'AC-2': 'FAIL', gate: 'PASS' }, 'baseA')
  const cand = rep({ 'AC-1': 'PASS', 'AC-2': 'PASS', gate: 'PASS' }, 'candB')
  const r = champion(base, cand)
  assert.equal(r.signTest.direction, 'up')
  assert.ok(r.signTest.significant)
  assert.equal(r.recommendation, 'DEPLOY')
}

// ── no change → REVIEW (no signal) ──
{
  const same = { 'AC-1': 'PASS', gate: 'PASS' }
  const r = champion(rep(same, 'a'), rep(same, 'b'))
  assert.equal(r.recommendation, 'REVIEW')
  assert.equal(r.signTest.nNonzero, 0)
}

// ── small/unreplicated difference → not significant → REVIEW (HOB: don't over-read one pair) ──
{
  const base = rep({ 'AC-1': 'PASS' }, 'a')
  const cand = [
    trial('S', 'b', { 'AC-1': 'FAIL' }),
    trial('S', 'b', { 'AC-1': 'PASS' }),
    trial('S', 'b', { 'AC-1': 'PASS' }),
  ]
  const r = champion(base, cand)
  assert.equal(r.signTest.nNonzero, 1)
  assert.equal(r.recommendation, 'REVIEW')
}

// ── ERRORED outcomes are dropped from pairing (infra ≠ signal) ──
{
  const base = rep({ 'AC-1': 'PASS' }, 'a')
  const cand = [
    trial('S', 'b', { 'AC-1': 'ERRORED' }),
    trial('S', 'b', { 'AC-1': 'ERRORED' }, 'ERRORED'),
    trial('S', 'b', { 'AC-1': 'PASS' }),
  ]
  const r = champion(base, cand)
  assert.equal(r.pairedDeltas, 1, 'only the one non-errored pair counts')
}

console.log('champion: all assertions passed')
