// evals/harness/load-golden.test.mjs — run: node evals/harness/load-golden.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isGreenGrade, loadGoldenSet } from './load-golden.mjs'

// ── isGreenGrade unit ──
assert.equal(isGreenGrade({ gate: 'PASS', acVector: { 'AC-1': 'PASS', 'AC-2': 'PASS' } }), true)
assert.equal(isGreenGrade({ gate: 'FAIL', acVector: { 'AC-1': 'PASS' } }), false)
assert.equal(isGreenGrade({ gate: 'PASS', acVector: { 'AC-1': 'FAIL' } }), false)
assert.equal(isGreenGrade({ gate: 'PASS', acVector: {} }), false)
assert.equal(isGreenGrade(null), false)

// ── real golden set: all three references are built + graded green → all admitted ──
// (PLAN-006 AC-5: G1 backend, G2 frontend, G3 fullstack references shipped. The un-built /
// red / green admission LOGIC is covered by the fixture block below, which stays hermetic.)
{
  const { admitted, rejected } = loadGoldenSet()
  assert.equal(rejected.length, 0, `golden set has a rejected spec: ${JSON.stringify(rejected)}`)
  assert.ok(admitted.length >= 3, 'the three golden references are built and admitted')
  for (const a of admitted) {
    assert.ok(a.grade && a.meta, `${a.id}: missing grade/meta`)
    assert.ok(a.grade.gate === 'PASS', `${a.id}: reference not green`)
  }
}

// ── fixture set: green admitted, red rejected, unbuilt rejected ──
{
  const root = mkdtempSync(join(tmpdir(), 'golden-'))
  const mk = (id, grade) => {
    const base = join(root, id)
    mkdirSync(join(base, 'reference'), { recursive: true })
    writeFileSync(join(base, 'meta.json'), JSON.stringify({ id, stack: 'express', profile: 'x' }))
    writeFileSync(join(base, 'spec.md'), '# spec')
    if (grade) writeFileSync(join(base, 'reference', 'grade.json'), JSON.stringify(grade))
  }
  mk('GREEN', { gate: 'PASS', acVector: { 'AC-1': 'PASS', 'AC-2': 'PASS' } })
  mk('RED', { gate: 'PASS', acVector: { 'AC-1': 'FAIL' } })
  mk('UNBUILT', null)

  const { admitted, rejected } = loadGoldenSet(root)
  assert.deepEqual(
    admitted.map((a) => a.id),
    ['GREEN'],
  )
  const reasons = Object.fromEntries(rejected.map((r) => [r.id, r.reason]))
  assert.match(reasons.RED, /did not grade green/)
  assert.match(reasons.UNBUILT, /not built/)
  rmSync(root, { recursive: true, force: true })
}

console.log('load-golden: all assertions passed')
