// evals/harness/run-trial.test.mjs — run: node evals/harness/run-trial.test.mjs
// Unit tests for the pure core of the AC-6 live trial runner. The live orchestration
// (scaffold → headless claude → grade) is verified end-to-end separately against an
// admitted golden spec; these cover the deterministic contract with score.mjs.
import assert from 'node:assert/strict'
import {
  parseArgs,
  checksFromAcResults,
  usageTokens,
  usageBreakdown,
  assembleTrial,
  buildAgentPrompt,
} from './run-trial.mjs'

// ── parseArgs ──
{
  const o = parseArgs(['node', 'run-trial.mjs', '--spec', 'SPEC-G1-backend', '--k', '3', '--budget', '1500000', '--model', 'claude-x', '--keep'])
  assert.equal(o.spec, 'SPEC-G1-backend')
  assert.equal(o.k, 3)
  assert.equal(o.budget, 1500000)
  assert.equal(o.model, 'claude-x')
  assert.equal(o.keep, true)
  assert.equal(o.timeoutMin, 30, 'default timeout')

  assert.throws(() => parseArgs(['n', 'r']), /--spec .* required/)
  assert.throws(() => parseArgs(['n', 'r', '--spec', 'S', '--k', '0']), /--k must be a positive integer/)
  assert.throws(() => parseArgs(['n', 'r', '--spec', 'S', '--budget', '-5']), /--budget must be > 0/)
  assert.throws(() => parseArgs(['n', 'r', '--spec', 'S', '--bogus']), /unknown arg/)
}

// ── checksFromAcResults: only explicit PASS is PASS; everything else FAIL ──
{
  const ac = { specId: 'SPEC-001', vector: { 'AC-1': 'PASS', 'AC-2': 'FAIL', 'AC-3': 'MISSING', 'AC-4': 'INVALID' } }
  assert.deepEqual(checksFromAcResults(ac, true), { gate: 'PASS', 'AC-1': 'PASS', 'AC-2': 'FAIL', 'AC-3': 'FAIL', 'AC-4': 'FAIL' })
  assert.deepEqual(checksFromAcResults(ac, false).gate, 'FAIL')
  // absent / malformed ac-results → just the gate check
  assert.deepEqual(checksFromAcResults(null, true), { gate: 'PASS' })
  assert.deepEqual(checksFromAcResults({}, false), { gate: 'FAIL' })
}

// ── usageTokens: FRESH tokens only (input+output+cache_creation); cache reads EXCLUDED ──
{
  assert.equal(
    usageTokens({ usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 999 } }),
    17,
    'cache reads are not counted toward the budget',
  )
  assert.equal(usageTokens({ usage: { output_tokens: 7 } }), 7)
  assert.equal(usageTokens({}), 0)
  assert.equal(usageTokens(null), 0)
}

// ── usageBreakdown: fresh vs cacheRead vs total + $ — the 44M-cache-read regression ──
{
  const bd = usageBreakdown({
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 2, cache_read_input_tokens: 40_000_000 },
    total_cost_usd: 1.23,
  })
  assert.equal(bd.fresh, 17)
  assert.equal(bd.cacheRead, 40_000_000)
  assert.equal(bd.total, 40_000_017)
  assert.equal(bd.costUsd, 1.23)
  // regression guard: a real multi-turn build's huge cache reads must NOT trip a fresh-token budget
  assert.ok(bd.fresh < 6_000_000, 'fresh tokens stay small even when cache reads are tens of millions')
}

// ── assembleTrial: status + budget wiring, matches score.mjs's shape ──
{
  const complete = assembleTrial({
    trialId: 'SPEC-G1-backend-1', specId: 'SPEC-G1-backend', harnessCommit: 'abc',
    aborted: false, agentErrored: false, tokenLimit: 1000, tokensUsed: 400, totalTokens: 40_000_400, costUsd: 2.5,
    checks: { gate: 'PASS', 'AC-1': 'PASS' },
  })
  assert.equal(complete.status, 'COMPLETE')
  assert.deepEqual(complete.budget, { tokenLimit: 1000, tokensUsed: 400, totalTokens: 40_000_400, costUsd: 2.5, aborted: false })
  assert.equal(complete.checks['AC-1'], 'PASS')
  assert.deepEqual(complete.judgeAdvisories, {})

  // budget breach → ERRORED
  const over = assembleTrial({ trialId: 't', specId: 'S', harnessCommit: 'a', aborted: true, agentErrored: false, tokenLimit: 100, tokensUsed: 250, checks: { gate: 'PASS' } })
  assert.equal(over.status, 'ERRORED')
  assert.equal(over.budget.aborted, true)

  // agent crash → ERRORED
  const crash = assembleTrial({ trialId: 't', specId: 'S', harnessCommit: 'a', aborted: false, agentErrored: true, tokenLimit: 100, tokensUsed: 0, checks: {} })
  assert.equal(crash.status, 'ERRORED')
}

// ── buildAgentPrompt: never invites editing the holdout ──
{
  const p = buildAgentPrompt('SPEC-G1-backend')
  assert.match(p, /do NOT edit anything under tests\/acceptance/)
  assert.match(p, /SPEC-G1-backend/)
  assert.match(p, /ac:vector/)
}

console.log('run-trial: all assertions passed')
