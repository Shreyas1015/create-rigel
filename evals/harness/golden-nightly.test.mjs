// evals/harness/golden-nightly.test.mjs — run: node evals/harness/golden-nightly.test.mjs
// Pure-core tests for the AC-7 nightly orchestrator. The live path (spawn run-trial → score →
// regress) is verified end-to-end via --score-only against a real admitted-spec trial dir.
import assert from 'node:assert/strict'
import { parseArgs, buildNightlyReport, reportMarkdown } from './golden-nightly.mjs'

// ── parseArgs ──
{
  const o = parseArgs(['n', 'g', '--specs', 'SPEC-G1-backend,SPEC-G2-frontend', '--k', '5', '--budget', '4000000', '--model', 'claude-x'])
  assert.deepEqual(o.specs, ['SPEC-G1-backend', 'SPEC-G2-frontend'])
  assert.equal(o.k, 5)
  assert.equal(o.budget, 4000000)
  assert.equal(o.model, 'claude-x')

  const so = parseArgs(['n', 'g', '--score-only', 'SPEC-G1-backend=evals/trials/g1-verify'])
  assert.deepEqual(so.scoreOnly, { 'SPEC-G1-backend': 'evals/trials/g1-verify' })

  assert.throws(() => parseArgs(['n', 'g', '--k', '0']), /--k must be a positive integer/)
  assert.throws(() => parseArgs(['n', 'g', '--bogus']), /unknown arg/)
}

// helper: a scorecard as scoreTrials() would produce
const sc = (k, checks, errored = 0) => ({ specId: 'S', k, erroredTrials: errored, harnessCommits: ['abc'], checks })
const chk = (passK, n = 3, fail = 0) => ({ pass: n - fail, fail, errored: 0, n, passK, passRate: n ? (n - fail) / n : null })

// ── buildNightlyReport: green / regression / errored-only handling ──
{
  const perSpec = [
    { specId: 'SPEC-G1-backend', scorecard: sc(3, { gate: chk(true), 'AC-1': chk(true) }), baselineFound: true, regressions: [] },
    { specId: 'SPEC-G2-frontend', scorecard: sc(3, { gate: chk(false, 3, 2), 'AC-1': chk(true) }), baselineFound: true, regressions: [{ check: 'gate' }] },
    // a check scored only from errored trials (n=0) must not drag "green" false
    { specId: 'SPEC-G3-fullstack', scorecard: sc(3, { gate: chk(true), 'AC-2': { pass: 0, fail: 0, errored: 3, n: 0, passK: false, passRate: null } }, 3), baselineFound: false, regressions: [] },
  ]
  const r = buildNightlyReport({ date: '2026-07-24', harnessCommit: 'deadbeefcafe', perSpec })
  assert.equal(r.specCount, 3)
  assert.equal(r.anyRegression, true, 'G2 has a regression')
  assert.equal(r.allGreen, false)
  const g1 = r.specs.find((s) => s.specId === 'SPEC-G1-backend')
  assert.equal(g1.green, true)
  const g2 = r.specs.find((s) => s.specId === 'SPEC-G2-frontend')
  assert.deepEqual(g2.regressions, ['gate'])
  const g3 = r.specs.find((s) => s.specId === 'SPEC-G3-fullstack')
  assert.equal(g3.green, true, 'n=0 (errored-only) check does not make the spec non-green')
  assert.equal(g3.baselineFound, false)
}

// ── all-green report ──
{
  const r = buildNightlyReport({
    date: '2026-07-24',
    harnessCommit: 'abc',
    perSpec: [{ specId: 'SPEC-G1-backend', scorecard: sc(3, { gate: chk(true) }), baselineFound: true, regressions: [] }],
  })
  assert.equal(r.anyRegression, false)
  assert.equal(r.allGreen, true)
  const md = reportMarkdown(r)
  assert.match(md, /all green/)
  assert.match(md, /SPEC-G1-backend/)
}

console.log('golden-nightly: all assertions passed')
