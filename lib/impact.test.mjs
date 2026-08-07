// lib/impact.test.mjs — run: node lib/impact.test.mjs
// The report is advisory, but a WRONG report is worse than none — people would act on it. The
// graph construction and the depth bound are pinned here.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import {
  sourceFiles,
  importsOf,
  buildGraph,
  reverseGraph,
  dependents,
  serviceImpact,
  touchesContract,
  BLIND_SPOTS,
} from './impact.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'imp-'))
const w = (root, p, body) => {
  mkdirSync(join(root, dirname(p)), { recursive: true })
  writeFileSync(join(root, p), body)
}

// ── TS import extraction: every syntax, and package imports EXCLUDED ──
{
  const root = mk()
  w(root, 'src/a.ts', `
import { x } from './b'
import './side-effect'
const c = require('./c')
export * from '../src/d'
const lazy = await import('./e')
import express from 'express'          // package — NOT in-repo blast radius
import { j } from './deep/f.js'        // TS often writes a .js specifier for a .ts file
`)
  w(root, 'src/b.ts', 'export const x = 1')
  w(root, 'src/side-effect.ts', '')
  w(root, 'src/c.ts', 'module.exports = {}')
  w(root, 'src/d.ts', 'export const d = 1')
  w(root, 'src/e.ts', 'export const e = 1')
  w(root, 'src/deep/f.ts', 'export const j = 1')

  const imports = importsOf(root, 'src/a.ts').sort()
  assert.deepEqual(imports, [
    'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/deep/f.ts', 'src/e.ts', 'src/side-effect.ts',
  ])
  assert.ok(!imports.some((p) => /express/.test(p)), 'package imports are not in-repo impact')
  rmSync(root, { recursive: true, force: true })
}

// ── index resolution ──
{
  const root = mk()
  w(root, 'src/a.ts', "import { r } from './repo'")
  w(root, 'src/repo/index.ts', 'export const r = 1')
  assert.deepEqual(importsOf(root, 'src/a.ts'), ['src/repo/index.ts'])
  rmSync(root, { recursive: true, force: true })
}

// ── Python relative imports, including the parent-package form ──
{
  const root = mk()
  w(root, 'src/svc/a.py', 'from .b import thing\nfrom ..models.order import Order\nimport os\n')
  w(root, 'src/svc/b.py', 'thing = 1')
  w(root, 'src/models/order.py', 'class Order: pass')
  const imports = importsOf(root, 'src/svc/a.py').sort()
  assert.deepEqual(imports, ['src/models/order.py', 'src/svc/b.py'])
  rmSync(root, { recursive: true, force: true })
}

// ── reverse edges + depth-limited dependents ──
{
  const root = mk()
  //  d → c → b → a   (arrows = "imports")
  w(root, 'src/a.ts', 'export const a = 1')
  w(root, 'src/b.ts', "import {a} from './a'; export const b = a")
  w(root, 'src/c.ts', "import {b} from './b'; export const c = b")
  w(root, 'src/d.ts', "import {c} from './c'; export const d = c")
  w(root, 'src/unrelated.ts', 'export const u = 1')

  const rev = reverseGraph(buildGraph(root))
  assert.deepEqual(rev['src/a.ts'], ['src/b.ts'], 'direct importers only')

  const levels = dependents(rev, ['src/a.ts'], 2)
  assert.deepEqual(levels, [['src/b.ts'], ['src/c.ts']], 'depth 2 stops before d')
  assert.deepEqual(dependents(rev, ['src/a.ts'], 3), [['src/b.ts'], ['src/c.ts'], ['src/d.ts']])
  assert.ok(!levels.flat().includes('src/unrelated.ts'))

  // a leaf nobody imports has no radius — and that is a real answer, not an error
  assert.deepEqual(dependents(rev, ['src/d.ts'], 3), [])
  rmSync(root, { recursive: true, force: true })
}

// ── a cycle must terminate, not hang ──
{
  const root = mk()
  w(root, 'src/x.ts', "import './y'")
  w(root, 'src/y.ts', "import './x'")
  const rev = reverseGraph(buildGraph(root))
  const levels = dependents(rev, ['src/x.ts'], 5)
  assert.deepEqual(levels, [['src/y.ts']], 'visited-set stops the cycle')
  rmSync(root, { recursive: true, force: true })
}

// ── sourceFiles skips the dirs that would swamp the graph ──
{
  const root = mk()
  w(root, 'src/a.ts', '')
  w(root, 'node_modules/pkg/i.ts', '')
  w(root, 'dist/out.js', '')
  w(root, 'src/__pycache__/x.py', '')
  assert.deepEqual(sourceFiles(root), ['src/a.ts'])

  // root-level entry points are scanned (non-recursively) — an entry point is the most important
  // dependent there is, and omitting it silently understates every radius
  w(root, 'cli.js', "import './src/a'")
  w(root, 'main.py', 'x = 1')
  assert.deepEqual(sourceFiles(root), ['cli.js', 'main.py', 'src/a.ts'])
  assert.deepEqual(reverseGraph(buildGraph(root))['src/a.ts'], ['cli.js'], 'the entry point shows up')
  rmSync(root, { recursive: true, force: true })
}

// ── the cross-service half reads the shipped map ──
{
  const root = mk()
  w(root, 'knowledge/map/services.json', JSON.stringify({
    services: {
      'acme-billing': { provides: ['billing-api'], consumedBy: ['acme-web', 'acme-orders'], capabilities: ['checkout'] },
    },
  }))
  w(root, 'knowledge/map/capabilities.json', JSON.stringify({
    capabilities: { checkout: { kpi: 'conversion_rate', owner: 'team-growth' } },
  }))
  const s = serviceImpact(root, 'acme-billing')
  assert.deepEqual(s.consumedBy, ['acme-web', 'acme-orders'])
  assert.equal(s.capabilities[0].kpi, 'conversion_rate')
  assert.equal(s.capabilities[0].owner, 'team-growth')

  // an unknown service is reported, not guessed at
  assert.ok(serviceImpact(root, 'nope').unknownService)
  // no map at all is not an error — most repos won't have one
  assert.equal(serviceImpact(mk(), 'x'), null)
  rmSync(root, { recursive: true, force: true })
}

// ── contract-touching heuristic ──
{
  assert.equal(touchesContract(['src/runtime/routes/v1/orders.route.ts']), true)
  assert.equal(touchesContract(['docs/generated/openapi.json']), true)
  assert.equal(touchesContract(['src/services/order.service.ts']), false)
}

// ── the blind spots must be stated, or the report implies completeness ──
{
  assert.ok(BLIND_SPOTS.length >= 4)
  assert.ok(BLIND_SPOTS.some((b) => /queue|event/i.test(b)), 'queues are the canonical blind spot')
  assert.ok(BLIND_SPOTS.some((b) => /flag/i.test(b)))
}

console.log('impact: all assertions passed')
