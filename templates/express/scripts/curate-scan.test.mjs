// scripts/curate-scan.test.mjs — run: node scripts/curate-scan.test.mjs
// Unit-tests the deterministic /curate core (grouping/counting/matching must not drift).
import assert from 'node:assert/strict'
import { scan } from './curate-scan.mjs'

const fail = (signature, plan, message = 'm', file = 'f') => ({ signature, plan, message, file })
const lesson = (id, signatures, status = 'OBSERVED', seen = 1) => ({ id, signatures, status, seen, file: `${id}.md` })

// ── no matching lesson → create, seen = distinct plans ──
{
  const p = scan([fail('arch:raw-orm-row', 'PLAN-001'), fail('arch:raw-orm-row', 'PLAN-002'), fail('arch:raw-orm-row', 'PLAN-003')], [])
  assert.equal(p.create.length, 1)
  assert.equal(p.create[0].signature, 'arch:raw-orm-row')
  assert.equal(p.create[0].seen, 3, 'three distinct plans → seen 3')
  assert.equal(p.increment.length, 0)
  assert.equal(p.promotionReady.length, 0)
}

// ── same plan repeated → counts once (distinct plans, not raw lines) ──
{
  const p = scan([fail('tsc:TS2345', 'PLAN-001'), fail('tsc:TS2345', 'PLAN-001')], [])
  assert.equal(p.create[0].seen, 1, 'same plan twice → seen 1')
}

// ── matches one lesson → increment; crosses 3 + DISTILLED → promotion-ready ──
{
  const p = scan(
    [fail('arch:isolation-test-missing', 'PLAN-007'), fail('arch:isolation-test-missing', 'PLAN-008')],
    [lesson('LSN-0007', ['arch:isolation-test-missing'], 'DISTILLED', 1)],
  )
  assert.equal(p.increment.length, 1)
  assert.equal(p.increment[0].id, 'LSN-0007')
  assert.equal(p.increment[0].seen, 3, '1 + 2 distinct plans')
  assert.deepEqual(p.promotionReady.map((x) => x.id), ['LSN-0007'])
}

// ── increment to 3 but status not DISTILLED → NOT promotion-ready (epistemic gate) ──
{
  const p = scan(
    [fail('arch:x', 'PLAN-001'), fail('arch:x', 'PLAN-002')],
    [lesson('LSN-0001', ['arch:x'], 'OBSERVED', 1)],
  )
  assert.equal(p.increment[0].seen, 3)
  assert.equal(p.promotionReady.length, 0, 'count alone does not promote — needs DISTILLED')
}

// ── coarse signature claimed by >1 lesson → disambiguate (model decides) ──
{
  const p = scan([fail('tsc:TS2345', 'PLAN-001')], [lesson('LSN-A', ['tsc:TS2345']), lesson('LSN-B', ['tsc:TS2345'])])
  assert.equal(p.disambiguate.length, 1)
  assert.deepEqual(p.disambiguate[0].candidates.sort(), ['LSN-A', 'LSN-B'])
  assert.equal(p.create.length, 0)
  assert.equal(p.increment.length, 0)
}

// ── already seen>=3 + DISTILLED (no new failures) → still promotion-ready ──
{
  const p = scan([], [lesson('LSN-0003', ['sig'], 'DISTILLED', 4)])
  assert.deepEqual(p.promotionReady.map((x) => x.id), ['LSN-0003'])
}

console.log('curate-scan: all assertions passed')
