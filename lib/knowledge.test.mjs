// lib/knowledge.test.mjs — run: node lib/knowledge.test.mjs
// Anchoring is what lets prose fail a build. If it silently passes on a dead anchor, the whole
// knowledge layer is back to being a wiki that rots — so every branch is pinned here.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import {
  parseFrontmatter,
  resolveAnchor,
  buildSourceIndex,
  checkKnowledge,
  selectForService,
  listKnowledgeFiles,
} from './knowledge.mjs'

// ── frontmatter ──
{
  const { data, body } = parseFrontmatter(`---
term: Shipment
status: stable
anchors:
  - path: src/models/Shipment.model.ts
  - symbol: Shipment
---
A Shipment is a physical movement of goods.`)
  assert.equal(data.term, 'Shipment')
  assert.equal(data.status, 'stable')
  assert.deepEqual(data.anchors, [{ path: 'src/models/Shipment.model.ts' }, { symbol: 'Shipment' }])
  assert.match(body, /physical movement/)

  // quotes stripped; no frontmatter is not an error
  assert.equal(parseFrontmatter('---\nterm: "Order"\n---\nx').data.term, 'Order')
  assert.deepEqual(parseFrontmatter('no frontmatter here').data, {})
}

// ── anchor resolution ──
{
  const root = mkdtempSync(join(tmpdir(), 'kn-'))
  const w = (p, body) => {
    mkdirSync(join(root, dirname(p)), { recursive: true })
    writeFileSync(join(root, p), body)
  }
  w('src/models/Shipment.model.ts', 'export class Shipment {}\n')
  w('src/util.py', 'def compute_total():\n    pass\n')
  const idx = buildSourceIndex(root)

  assert.deepEqual(resolveAnchor(root, { path: 'src/models/Shipment.model.ts' }, idx), { ok: true })
  assert.equal(resolveAnchor(root, { path: 'src/nope.ts' }, idx).ok, false)

  assert.equal(resolveAnchor(root, { symbol: 'Shipment' }, idx).ok, true, 'class definition found')
  assert.equal(resolveAnchor(root, { symbol: 'compute_total' }, idx).ok, true, 'python def found')
  assert.equal(resolveAnchor(root, { symbol: 'Ghost' }, idx).ok, false)

  // a mere mention is not a definition — otherwise the check is worthless
  w('src/other.ts', '// we should add Ghost one day\n')
  assert.equal(resolveAnchor(root, { symbol: 'Ghost' }, buildSourceIndex(root)).ok, false)

  assert.equal(resolveAnchor(root, {}, idx).ok, false, 'an anchor with neither path nor symbol')
  rmSync(root, { recursive: true, force: true })
}

// ── checkKnowledge end to end ──
{
  const root = mkdtempSync(join(tmpdir(), 'kn2-'))
  const w = (p, body) => {
    mkdirSync(join(root, dirname(p)), { recursive: true })
    writeFileSync(join(root, p), body)
  }
  w('src/models/Order.model.ts', 'export class Order {}')
  w('knowledge/domain/glossary/order.md', `---
term: Order
anchors:
  - symbol: Order
---
The commercial agreement.`)
  w('knowledge/domain/glossary/shipment.md', `---
term: Shipment
anchors:
  - path: src/models/Shipment.model.ts
---
Deleted model — this anchor is dead.`)
  // a context doc with no anchors is fine and must not be flagged
  w('knowledge/domain/contexts/billing.md', '# Billing\n\nNo anchors here.')
  w('knowledge/business/company.md', '# Acme\n\nBusiness context is never anchored.')

  const r = checkKnowledge(root)
  assert.equal(r.checked, 2, 'two anchors checked; unanchored prose skipped')
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /shipment\.md \(Shipment\).*path not found/)

  // fix it → clean
  w('src/models/Shipment.model.ts', 'export class Shipment {}')
  assert.equal(checkKnowledge(root).problems.length, 0)

  // no knowledge dir at all → not an error
  rmSync(join(root, 'knowledge'), { recursive: true, force: true })
  assert.deepEqual(checkKnowledge(root), { checked: 0, entries: [], problems: [] })
  rmSync(root, { recursive: true, force: true })
}

// ── distribution: whole glossary, OWN context only ──
{
  const all = [
    'business/company.md',
    'business/capabilities/checkout.md',
    'domain/glossary/order.md',
    'domain/glossary/shipment.md',
    'domain/contexts/billing.md',
    'domain/contexts/identity.md',
    'map/services.json',
  ]
  const forBilling = selectForService(all, 'billing')
  assert.ok(forBilling.includes('domain/glossary/order.md'), 'whole glossary')
  assert.ok(forBilling.includes('domain/glossary/shipment.md'), 'whole glossary')
  assert.ok(forBilling.includes('business/capabilities/checkout.md'), 'whole business')
  assert.ok(forBilling.includes('map/services.json'), 'whole map — offline cross-repo reasoning')
  assert.ok(forBilling.includes('domain/contexts/billing.md'), 'its OWN context')
  assert.ok(!forBilling.includes('domain/contexts/identity.md'), "NOT another service's context")

  // no context given → no context docs at all (never guess)
  assert.ok(!selectForService(all, null).some((p) => p.startsWith('domain/contexts/')))
}

// ── listKnowledgeFiles ──
{
  const root = mkdtempSync(join(tmpdir(), 'kn3-'))
  mkdirSync(join(root, 'domain', 'glossary'), { recursive: true })
  writeFileSync(join(root, 'domain', 'glossary', 'a.md'), 'x')
  assert.deepEqual(listKnowledgeFiles(root), ['domain/glossary/a.md'])
  assert.deepEqual(listKnowledgeFiles(join(root, 'nope')), [], 'missing dir is empty, not a throw')
  rmSync(root, { recursive: true, force: true })
}

console.log('knowledge: all assertions passed')
