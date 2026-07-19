// evals/harness/calibrate.test.mjs — run: node evals/harness/calibrate.test.mjs
import assert from 'node:assert/strict'
import { calibrate, deterministicRefFromVector } from './calibrate.mjs'
import { checkPromotion } from './promotion-check.mjs'

const PP = { judge: 'PASS', reference: 'PASS' }
const FF = { judge: 'FAIL', reference: 'FAIL' }

// ── deterministicRefFromVector ──
assert.equal(deterministicRefFromVector('PASS'), 'PASS')
assert.equal(deterministicRefFromVector('FAIL'), 'FAIL')
assert.equal(deterministicRefFromVector('MISSING'), 'FAIL')
assert.equal(deterministicRefFromVector('INVALID'), 'FAIL')

// ── calibrate ──
{
  const set = {
    generatedAt: '2026-07-19T00:00:00.000Z',
    judgeModel: 'opus',
    dimensions: {
      // bootstrap, judge==reference → κ=1 → eligible without any human
      'spec-judge/ac-conformance': { method: 'bootstrap', severity: 'normal', labels: [PP, FF, PP, FF] },
      // bootstrap, judge all PASS vs mixed reference → κ=0 → not eligible
      'bootstrap/bad': {
        method: 'bootstrap',
        labels: [
          { judge: 'PASS', reference: 'PASS' },
          { judge: 'PASS', reference: 'FAIL' },
          { judge: 'PASS', reference: 'PASS' },
          { judge: 'PASS', reference: 'FAIL' },
        ],
      },
      // human, SOLO (no human2) → reduced-confidence → not eligible even at κ=1
      'spec-judge/intent': { method: 'human', labels: [PP, FF, PP, FF] },
      // human, two raters, judge==ref (κ=1) and ref==human2 (κ=1) → eligible
      'human/good': {
        method: 'human',
        labels: [
          { judge: 'PASS', reference: 'PASS', human2: 'PASS' },
          { judge: 'FAIL', reference: 'FAIL', human2: 'FAIL' },
          { judge: 'PASS', reference: 'PASS', human2: 'PASS' },
          { judge: 'FAIL', reference: 'FAIL', human2: 'FAIL' },
        ],
      },
      // human, judge==ref (κ=1) but raters disagree (hh κ<0.4) → rubric invalid → not eligible
      'human/rubric-broken': {
        method: 'human',
        labels: [
          { judge: 'PASS', reference: 'PASS', human2: 'FAIL' },
          { judge: 'FAIL', reference: 'FAIL', human2: 'PASS' },
          { judge: 'PASS', reference: 'PASS', human2: 'FAIL' },
          { judge: 'FAIL', reference: 'FAIL', human2: 'PASS' },
        ],
      },
      // blocker severity uses the 0.8 threshold
      'blocker/dim': { method: 'bootstrap', severity: 'blocker', labels: [PP, FF, PP, FF] },
    },
  }
  const rep = calibrate(set)
  const D = rep.dimensions

  assert.equal(D['spec-judge/ac-conformance'].judgeKappa, 1)
  assert.equal(D['spec-judge/ac-conformance'].promoteEligible, true, 'bootstrap κ=1 → eligible')

  assert.equal(D['bootstrap/bad'].promoteEligible, false, 'bootstrap κ=0 → not eligible')

  assert.equal(D['spec-judge/intent'].reducedConfidence, true, 'solo human → reduced-confidence')
  assert.equal(D['spec-judge/intent'].promoteEligible, false, 'solo human never eligible')

  assert.equal(D['human/good'].rubricValid, true)
  assert.equal(D['human/good'].promoteEligible, true, 'two raters + valid rubric + high κ → eligible')

  assert.equal(D['human/rubric-broken'].rubricValid, false)
  assert.equal(D['human/rubric-broken'].promoteEligible, false, 'invalid rubric → not eligible')

  assert.equal(D['blocker/dim'].threshold, 0.8, 'blocker severity → 0.8 threshold')
  assert.equal(rep.judgeModelPinned, true)
}

// ── promotion-check ──
{
  const now = Date.parse('2026-07-19T00:00:00.000Z')
  const fresh = '2026-07-01T00:00:00.000Z' // 18 days old
  const stale = '2026-01-01T00:00:00.000Z' // >90 days old
  const report = {
    generatedAt: fresh,
    dimensions: { 'spec-judge/ac-conformance': { promoteEligible: true, judgeKappa: 1, threshold: 0.6 } },
  }
  const staleReport = { ...report, generatedAt: stale }
  const ineligible = {
    generatedAt: fresh,
    dimensions: { 'spec-judge/intent': { promoteEligible: false, judgeKappa: 0.2, threshold: 0.6, reducedConfidence: true } },
  }
  const readReport = (p) =>
    ({ 'ok.json': report, 'stale.json': staleReport, 'ineligible.json': ineligible })[p] ??
    (() => {
      throw new Error('missing')
    })()

  // all-advisory → clean
  const advisory = { dimensions: { 'spec-judge/ac-conformance': { mode: 'advisory', report: null } } }
  assert.deepEqual(checkPromotion(advisory, { now, readReport }).violations, [])

  // blocking + valid fresh eligible report → clean
  const blockingOk = { dimensions: { 'spec-judge/ac-conformance': { mode: 'blocking', report: 'ok.json' } } }
  assert.deepEqual(checkPromotion(blockingOk, { now, readReport }).violations, [])

  // blocking + no report → violation
  const noReport = { dimensions: { 'spec-judge/ac-conformance': { mode: 'blocking', report: null } } }
  assert.equal(checkPromotion(noReport, { now, readReport }).violations.length, 1)

  // blocking + stale → violation
  const staleCfg = { dimensions: { 'spec-judge/ac-conformance': { mode: 'blocking', report: 'stale.json' } } }
  assert.match(checkPromotion(staleCfg, { now, readReport }).violations[0], /stale/)

  // blocking + ineligible dimension → violation
  const ineligCfg = { dimensions: { 'spec-judge/intent': { mode: 'blocking', report: 'ineligible.json' } } }
  assert.match(checkPromotion(ineligCfg, { now, readReport }).violations[0], /not promotion-eligible/)

  // blocking + report missing the dimension → violation
  const wrongDim = { dimensions: { 'vision-judge/layout': { mode: 'blocking', report: 'ok.json' } } }
  assert.match(checkPromotion(wrongDim, { now, readReport }).violations[0], /no entry for this dimension/)
}

console.log('calibrate + promotion-check: all assertions passed')
