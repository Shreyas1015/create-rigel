// evals/harness/lib/eval-lib.test.mjs — zero-dep assertions for the harness math.
// Run: node evals/harness/lib/eval-lib.test.mjs
import assert from 'node:assert/strict'
import {
  allCheckIds,
  balancedSample,
  binomialCdf,
  cohenKappa,
  passAtK,
  signTest,
} from './eval-lib.mjs'

const approx = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps

// ── Cohen's κ ──
{
  // Textbook case: po=0.8, pe=0.48, κ=0.32/0.52≈0.6154
  const k = cohenKappa([1, 1, 0, 0, 1], [1, 0, 0, 0, 1])
  assert.ok(approx(k.kappa, 0.6154), `kappa ${k.kappa}`)
  assert.equal(k.degenerate, false)

  const perfect = cohenKappa(['a', 'b', 'a'], ['a', 'b', 'a'])
  assert.equal(perfect.kappa, 1)

  // Both raters used a single category → pe=1, degenerate flagged, not a bogus number.
  const deg = cohenKappa([1, 1, 1], [1, 1, 1])
  assert.equal(deg.degenerate, true)
  assert.equal(deg.kappa, 1)

  // Systematic disagreement → negative κ.
  const bad = cohenKappa([1, 1, 1, 1], [0, 0, 0, 0])
  assert.ok(bad.kappa <= 0, `bad kappa ${bad.kappa}`)
}

// ── binomial + sign test ──
{
  assert.ok(approx(binomialCdf(0, 6, 0.5), 1 / 64))
  assert.ok(approx(binomialCdf(1, 4, 0.5), 5 / 16))

  // 3 up, 1 down, 1 tie → n=4, min=1, two-sided = 2*(5/16) = 0.625, not significant
  const s1 = signTest([1, 2, 0.5, -1, 0])
  assert.equal(s1.nNonzero, 4)
  assert.ok(approx(s1.pValue, 0.625), `p ${s1.pValue}`)
  assert.equal(s1.significant, false)
  assert.equal(s1.direction, 'up')

  // 6 up, 0 down → two-sided = 2*(1/64) = 0.03125, significant, direction up
  const s2 = signTest([1, 1, 1, 1, 1, 1])
  assert.ok(approx(s2.pValue, 0.03125), `p ${s2.pValue}`)
  assert.equal(s2.significant, true)
  assert.equal(s2.direction, 'up')

  // all ties → no evidence
  const s3 = signTest([0, 0, 0])
  assert.equal(s3.significant, false)
  assert.equal(s3.direction, 'none')
}

// ── balancedSample ──
{
  const items = [
    { id: 1, v: 'pass' },
    { id: 2, v: 'pass' },
    { id: 3, v: 'pass' },
    { id: 4, v: 'fail' },
  ]
  const { sample, counts } = balancedSample(items, (x) => x.v, 2)
  assert.equal(counts.pass, 2) // capped at 2 despite 3 available
  assert.equal(counts.fail, 1) // rare class kept whole
  assert.equal(sample.length, 3)
}

// ── passAtK / allCheckIds ──
{
  const trials = [
    { 'AC-1': 'PASS', gate: 'PASS' },
    { 'AC-1': 'PASS', gate: 'FAIL' },
    { 'AC-1': 'PASS', gate: 'ERRORED' },
  ]
  const ac1 = passAtK(trials, 'AC-1')
  assert.equal(ac1.passK, true)
  assert.equal(ac1.passRate, 1)

  const gate = passAtK(trials, 'gate')
  assert.equal(gate.n, 2) // ERRORED excluded
  assert.equal(gate.passK, false)
  assert.equal(gate.passRate, 0.5)

  assert.deepEqual(allCheckIds(trials).sort(), ['AC-1', 'gate'])
}

console.log('eval-lib: all assertions passed')
