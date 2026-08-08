// lib/candidates.test.mjs — run: node lib/candidates.test.mjs
// A proposal the anchor checker would reject is worse than no proposal, so the two things that
// matter are pinned: every candidate is really DEFINED, and plumbing never outranks the domain.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { candidates, existingTerms } from './candidates.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'cand-'))
const w = (root, rel, body) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), body)
}

// ── domain layers outrank plumbing, however high the plumbing's fan-in ──
{
  const root = mk()
  w(root, 'src/types/order.types.ts', 'export interface Order { id: string }\n')
  w(root, 'src/utils/errors.util.ts', 'export class AppError extends Error {}\n')
  // give the util enormous fan-in and the domain type almost none
  for (let i = 0; i < 8; i++) w(root, `src/runtime/r${i}.ts`, "import { AppError } from '../utils/errors.util'\n")
  w(root, 'src/services/order.service.ts', "import { Order } from '../types/order.types'\n")

  const got = candidates(root).map((c) => c.symbol)
  assert.equal(got[0], 'Order', 'a domain type must outrank a util imported everywhere')
  assert.ok(got.includes('AppError'))
  rmSync(root, { recursive: true, force: true })
}

// ── framework types are never proposed ──
{
  const root = mk()
  w(root, 'src/runtime/app.ts', 'import type { Express } from "express"\ntype Application = Express\n')
  w(root, 'src/types/a.types.ts', 'export interface Invoice { id: string }\n')
  const got = candidates(root).map((c) => c.symbol)
  assert.ok(!got.includes('Express'), 'Express is plumbing with huge fan-in — never a glossary term')
  assert.ok(!got.includes('Application'))
  assert.ok(got.includes('Invoice'))
  rmSync(root, { recursive: true, force: true })
}

// ── tests are not a source of domain terms, and the cap is honoured ──
{
  const root = mk()
  for (let i = 0; i < 20; i++) w(root, `src/types/t${i}.types.ts`, `export interface Thing${i} { a: string }\n`)
  w(root, 'tests/unit/x.test.ts', 'export interface TestOnlyThing { a: string }\n')
  const got = candidates(root, { limit: 5 })
  assert.equal(got.length, 5, 'the cap is real — a 200-term auto-glossary is the wiki we refuse to be')
  assert.ok(!got.some((c) => c.symbol === 'TestOnlyThing'))
  rmSync(root, { recursive: true, force: true })
}

// ── an already-documented term is never re-proposed ──
{
  const root = mk()
  w(root, 'src/types/a.types.ts', 'export interface Shipment { id: string }\nexport interface Parcel { id: string }\n')
  w(root, 'knowledge/domain/glossary/shipment.md', '---\nterm: Shipment\nanchors:\n  - symbol: Shipment\n---\nA thing.\n')
  assert.deepEqual([...existingTerms(root)], ['Shipment'])
  const got = candidates(root).map((c) => c.symbol)
  assert.ok(!got.includes('Shipment'))
  assert.ok(got.includes('Parcel'))
  rmSync(root, { recursive: true, force: true })
}

// ── every candidate is DEFINED where reported (an anchor on it will resolve) ──
{
  const root = mk()
  w(root, 'src/types/a.types.ts', 'export interface Order { id: string }\n')
  w(root, 'src/services/s.ts', "import { Order } from '../types/a.types'\n// mentions Order in a comment\n")
  const got = candidates(root)
  assert.equal(got.length, 1)
  assert.equal(got[0].file, 'src/types/a.types.ts', 'the DEFINITION site, not a mention')
  rmSync(root, { recursive: true, force: true })
}

console.log('candidates: all assertions passed')
