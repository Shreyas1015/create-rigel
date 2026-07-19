// evals/harness/parity.test.mjs — run: node evals/harness/parity.test.mjs
import assert from 'node:assert/strict'
import { parity } from './parity.mjs'

const pair = (opus, cheap, severity = 'normal') => ({ opus, cheap, severity })

const set = {
  cheaperTier: 'sonnet',
  agents: {
    // perfect agreement, no blocker disagreements → adopt-cheaper
    'doc-gardener-like': { pairs: [pair('PASS', 'PASS'), pair('FAIL', 'FAIL'), pair('PASS', 'PASS'), pair('FAIL', 'FAIL')] },
    // high κ but ONE blocker-severity disagreement → keep-opus (safety veto)
    'gate-checker': {
      pairs: [
        pair('PASS', 'PASS'),
        pair('FAIL', 'FAIL', 'blocker'),
        pair('PASS', 'PASS'),
        pair('FAIL', 'PASS', 'blocker'), // disagreement on a blocker-severity item
      ],
    },
    // low agreement → keep-opus
    'security-auditor': { pairs: [pair('PASS', 'FAIL'), pair('FAIL', 'PASS'), pair('PASS', 'FAIL'), pair('FAIL', 'PASS')] },
  },
}

const r = parity(set)
assert.equal(r.cheaperTier, 'sonnet')
assert.equal(r.agents['doc-gardener-like'].kappa, 1)
assert.equal(r.agents['doc-gardener-like'].decision, 'adopt-cheaper')

assert.equal(r.agents['gate-checker'].blockerDisagreements, 1)
assert.equal(r.agents['gate-checker'].decision, 'keep-opus', 'a blocker-severity disagreement vetoes adoption')

assert.ok(r.agents['security-auditor'].kappa < 0.8)
assert.equal(r.agents['security-auditor'].decision, 'keep-opus')

console.log('parity: all assertions passed')
