// lib/map.test.mjs — run: node lib/map.test.mjs
// The map answers "who breaks if I change this?". If an edge is wrong the answer is wrong, so the
// derivation and the resolution are pinned here rather than trusted.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { extractFacts, aggregate, readCapabilities, queryMap, formatSlice } from './map.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'map-'))
const w = (root, p, body) => {
  mkdirSync(join(root, dirname(p)), { recursive: true })
  writeFileSync(join(root, p), typeof body === 'string' ? body : JSON.stringify(body))
}

// ── extractFacts: everything derived from artifacts that already exist ──
{
  const root = mk()
  w(root, 'docs/generated/openapi.json', { info: { title: 'Billing API' }, paths: { '/a': {}, '/b': {} } })
  // includes the service's OWN container and an observability sidecar — neither is a dependency
  w(root, 'docker-compose.yml', 'services:\n  app:\n    build: .\n  postgres:\n    image: postgres:16\n  redis:\n    image: redis:7\n  alloy:\n    image: grafana/alloy\n')
  w(root, '.env.example', 'DATABASE_URL=x\nREDIS_URL=y\n')

  const f = extractFacts(root, { service: 'acme-billing', template: 'express' })
  assert.deepEqual(f.provides, [{ api: 'billing-api', spec: 'docs/generated/openapi.json', paths: 2 }])
  assert.deepEqual(f.deps, ['postgres', 'redis'], 'compose + env, deduped and sorted')
  assert.deepEqual(f.consumes, [], 'its own published spec is not something it consumes')
  rmSync(root, { recursive: true, force: true })
}

// ── a vendored contract is a CONSUMED api, named from its own info.title ──
{
  const root = mk()
  w(root, 'openapi.json', { info: { title: 'Billing API' }, paths: { '/x': {} } })
  const f = extractFacts(root, { service: 'acme-web', template: 'nextjs' })
  assert.deepEqual(f.consumes, [{ api: 'billing-api', via: 'openapi.json' }])
  assert.deepEqual(f.provides, [], 'a frontend publishes nothing')
  rmSync(root, { recursive: true, force: true })
}

// ── no artifacts at all → honest empties, never a guess ──
{
  const root = mk()
  const f = extractFacts(root, { service: 'bare' })
  assert.deepEqual(f, { service: 'bare', template: null, provides: [], consumes: [], deps: [], generatedAt: null })
  rmSync(root, { recursive: true, force: true })
}

// ── aggregate: resolves who-consumes-whom, and the reverse edge ──
{
  const facts = [
    { service: 'acme-billing', template: 'express', provides: [{ api: 'billing-api' }], consumes: [], deps: ['postgres'] },
    { service: 'acme-web', template: 'nextjs', provides: [], consumes: [{ api: 'billing-api' }], deps: [] },
    { service: 'acme-orders', template: 'express', provides: [{ api: 'orders-api' }], consumes: [{ api: 'billing-api' }], deps: [] },
  ]
  const caps = { checkout: { kpi: 'conversion_rate', owner: 'team-growth', services: ['acme-billing', 'acme-web'] } }
  const map = aggregate(facts, { capabilities: caps, now: '2026-07-31' })

  assert.deepEqual(map.services['acme-web'].consumesFrom, ['acme-billing'], 'edge resolved by api name')
  assert.deepEqual(
    map.services['acme-billing'].consumedBy,
    ['acme-orders', 'acme-web'],
    'the reverse edge — who breaks if billing changes its contract',
  )
  assert.deepEqual(map.services['acme-billing'].capabilities, ['checkout'])
  assert.deepEqual(map.services['acme-orders'].capabilities, [], 'not listed in the capability')
  assert.match(map['//'], /GENERATED/, 'carries a do-not-edit header')
  assert.deepEqual(Object.keys(map.services), ['acme-billing', 'acme-orders', 'acme-web'], 'stable order')
}

// ── a consumed api nobody publishes yields no edge (not a crash, not a fake edge) ──
{
  const map = aggregate([{ service: 'a', provides: [], consumes: [{ api: 'ghost-api' }], deps: [] }])
  assert.deepEqual(map.services.a.consumesFrom, [])
  assert.deepEqual(map.services.a.consumes, ['ghost-api'], 'the claim is kept, the edge is not invented')
}

// ── self-consumption never produces a self-edge ──
{
  const map = aggregate([{ service: 'a', provides: [{ api: 'a-api' }], consumes: [{ api: 'a-api' }], deps: [] }])
  assert.deepEqual(map.services.a.consumesFrom, [])
}

// ── capabilities read from frontmatter ──
{
  const dir = mk()
  writeFileSync(
    join(dir, 'checkout.md'),
    `---
capability: checkout
owner: team-growth
kpi: conversion_rate
services: [acme-web, acme-billing]
---
prose`,
  )
  const caps = readCapabilities(dir)
  assert.equal(caps.checkout.kpi, 'conversion_rate')
  assert.deepEqual(caps.checkout.services, ['acme-web', 'acme-billing'], 'inline list parsed')
  assert.deepEqual(readCapabilities(join(dir, 'nope')), {}, 'missing dir is empty, not a throw')
  rmSync(dir, { recursive: true, force: true })
}

// ── query returns a slice, and the format names the blast radius ──
{
  const map = aggregate([
    { service: 'billing', provides: [{ api: 'billing-api' }], consumes: [], deps: ['postgres'] },
    { service: 'web', provides: [], consumes: [{ api: 'billing-api' }], deps: [] },
  ])
  assert.equal(queryMap(map, 'nope'), null)
  const out = formatSlice(queryMap(map, 'billing'), {})
  assert.match(out, /CONSUMED BY\s+web/)
  assert.match(out, /these break if you change your contract/)
}

console.log('map: all assertions passed')
