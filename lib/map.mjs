// lib/map.mjs — PLAN-009 AC-3. The service map: facts up, index down.
//
//   each service repo ──(rigel facts → .rigel/service.json)──▶ layer ──(rigel map:build)──▶
//        knowledge/map/services.json ──(rigel update)──▶ back to every service repo
//
// Each repo only ever asserts facts about ITSELF. The layer aggregates. Everyone gets the merged
// index back. Nothing is hand-maintained — hand-written dependency lists are always wrong (Roadie
// customers plateau at 88–90% catalog completeness after months of funded effort).
//
// The map is DATA QUERIED BY A SCRIPT, never a document loaded into context. At 50 services a
// prose listing would eat the context window every session for nothing.
//
// Zero dependencies — this ships inside scaffolded repos.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './knowledge.mjs'

export const FACTS_PATH = '.rigel/service.json'

// Where each stack leaves the contract it PUBLISHES vs one it VENDORS from someone else.
// These must not overlap: a root openapi.json is what `/api-sync` vendors from a provider, so
// treating it as "published" would silently invert every edge in the map.
const PROVIDES_SPECS = ['docs/generated/openapi.json'] // written by `openapi:export`
const CONSUMES_SPECS = ['openapi.json'] // vendored by `/api-sync` from a provider

/**
 * Derive this repo's facts. Everything here comes from an artifact that already exists — nothing
 * is asked of a human, because anything a human must remember to update is already wrong.
 */
export function extractFacts(root, { service, template = null, now = null } = {}) {
  const provides = []
  const consumes = []

  for (const rel of PROVIDES_SPECS) {
    const spec = readJsonIf(join(root, rel))
    if (!spec) continue
    provides.push({
      api: apiName(spec, service),
      spec: rel,
      paths: Object.keys(spec.paths ?? {}).length,
    })
    break // the first one found is the published contract
  }

  // A vendored contract that is NOT this repo's own publication is something it consumes.
  for (const rel of CONSUMES_SPECS) {
    if (provides.some((p) => p.spec === rel)) continue
    const spec = readJsonIf(join(root, rel))
    if (!spec) continue
    consumes.push({ api: apiName(spec, null), via: rel })
  }

  return {
    service,
    template,
    provides,
    consumes,
    deps: [...new Set([...composeServices(root), ...envDeps(root)])].sort(),
    generatedAt: now,
  }
}

function apiName(spec, fallback) {
  const title = spec?.info?.title
  if (title && typeof title === 'string') return slug(title)
  return fallback ? `${fallback}-api` : 'unknown-api'
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function readJsonIf(p) {
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// A compose file also contains the service's OWN container and its observability sidecars. Neither
// is a dependency — listing "app" as its own dep is plainly wrong, and telemetry collectors are
// infrastructure the service emits to, not something whose contract can break it.
const NOT_A_DEP = new Set([
  'app', 'api', 'web', 'server', 'service',
  'alloy', 'lgtm', 'otel-collector', 'otelcol', 'jaeger', 'grafana', 'prometheus', 'tempo', 'loki',
])

/** Infra a repo depends on, from its compose file — the honest source, not a guess. */
function composeServices(root) {
  for (const name of ['docker-compose.yml', 'docker-compose.yaml']) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    const out = []
    // Top-level keys under `services:` — two-space indented, which every compose file we ship uses.
    const body = /^services:\s*$([\s\S]*?)(?=^\S|\Z)/m.exec(text)
    if (body) {
      for (const line of body[1].split('\n')) {
        const m = /^ {2}([a-zA-Z0-9_-]+):\s*$/.exec(line)
        if (m && !NOT_A_DEP.has(m[1])) out.push(m[1])
      }
    }
    return out
  }
  return []
}

/** Infra implied by declared env vars — catches deps a compose file omits (managed services). */
function envDeps(root) {
  const out = []
  for (const name of ['.env.example', '.env.sample']) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    const text = readFileSync(p, 'utf8')
    if (/^\s*DATABASE_URL=/m.test(text)) out.push('postgres')
    if (/^\s*REDIS_URL=/m.test(text)) out.push('redis')
    if (/^\s*(KAFKA|BROKER)_/m.test(text)) out.push('kafka')
    break
  }
  return out
}

// ── aggregation (layer side) ────────────────────────────────────────────────────
/**
 * Merge every service's self-reported facts into one index, and resolve who consumes whom by
 * matching consumed API names against published ones.
 */
export function aggregate(factsList, { capabilities = {}, now = null } = {}) {
  const services = {}
  const providerOf = new Map()

  for (const f of factsList) {
    for (const p of f.provides ?? []) providerOf.set(p.api, f.service)
  }

  for (const f of [...factsList].sort((a, b) => a.service.localeCompare(b.service))) {
    services[f.service] = {
      template: f.template ?? null,
      provides: (f.provides ?? []).map((p) => p.api).sort(),
      consumes: (f.consumes ?? []).map((c) => c.api).sort(),
      // resolved edges: the point of the whole exercise — "who breaks if I change this?"
      consumesFrom: [
        ...new Set((f.consumes ?? []).map((c) => providerOf.get(c.api)).filter((s) => s && s !== f.service)),
      ].sort(),
      deps: f.deps ?? [],
      capabilities: Object.entries(capabilities)
        .filter(([, c]) => (c.services ?? []).includes(f.service))
        .map(([name]) => name)
        .sort(),
    }
  }

  // Reverse edges, so a provider can answer "who consumes me?" without scanning.
  for (const [name, s] of Object.entries(services)) {
    s.consumedBy = Object.entries(services)
      .filter(([other, o]) => other !== name && o.consumesFrom.includes(name))
      .map(([other]) => other)
      .sort()
  }

  return {
    '//': 'GENERATED by `rigel map:build` — do not edit. Regenerated from each service\'s own facts.',
    generatedAt: now,
    services,
  }
}

/** Read capability frontmatter from a layer's knowledge/business/capabilities/. */
export function readCapabilities(dir) {
  if (!existsSync(dir)) return {}
  const out = {}
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const { data } = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
    const name = data.capability ?? f.replace(/\.md$/, '')
    out[name] = {
      owner: data.owner ?? null,
      kpi: data.kpi ?? null,
      revenue_link: data.revenue_link ?? null,
      services: parseList(data.services),
    }
  }
  return out
}

function parseList(v) {
  if (Array.isArray(v)) return v
  if (typeof v !== 'string') return []
  return v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ── query (service side) ────────────────────────────────────────────────────────
/**
 * The slice an agent actually needs. Printed by `rigel map <service>` — never the whole file, which
 * is why the map can grow to 50 services without costing context.
 */
export function queryMap(map, service) {
  const s = map?.services?.[service]
  if (!s) return null
  return { service, ...s }
}

export function formatSlice(slice, capabilities = {}) {
  if (!slice) return null
  const L = []
  L.push(`  ${slice.service}${slice.template ? `  (${slice.template})` : ''}`)
  if (slice.provides.length) L.push(`  provides     ${slice.provides.join(', ')}`)
  if (slice.consumesFrom.length) L.push(`  consumes     ${slice.consumesFrom.join(', ')}`)
  if (slice.consumedBy.length) {
    L.push(`  CONSUMED BY  ${slice.consumedBy.join(', ')}   ← these break if you change your contract`)
  }
  if (slice.deps.length) L.push(`  infra        ${slice.deps.join(', ')}`)
  for (const c of slice.capabilities) {
    const cap = capabilities[c]
    L.push(`  capability   ${c}${cap?.kpi ? `  (KPI ${cap.kpi}${cap.owner ? `, ${cap.owner}` : ''})` : ''}`)
  }
  return L.join('\n')
}
