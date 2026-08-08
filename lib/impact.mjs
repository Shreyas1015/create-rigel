// lib/impact.mjs — PLAN-011 AC-1. Blast radius: a LENS, never a gate.
//
// Answers "if I change this, what else is involved?" by joining three things Rigel already knows:
//   in-repo    which files import the ones I changed        (reverse import edges)
//   services   who consumes the API I provide                (knowledge/map → consumedBy)
//   business   which capability, whose KPI                   (knowledge/business/capabilities)
//
// WHY THIS NEVER BLOCKS. Impact analysis is conservative by construction — it flags what *might*
// be affected, so it over-reports. And static graphs are blind exactly where it hurts: a queue, a
// feature flag, a string-keyed route. High false-positive rates cause alert fatigue, and teams
// respond by disabling the blocking behaviour. Rigel already refused the OTel service-graph gate
// for this reason. A cry-wolf gate here would cost us the gates that work — which are the asset.
//
// Exactness lives in the contract gate (oasdiff). This provides context. Exit code is always 0.
//
// Granularity is FILE-LEVEL on purpose: that is what Bazel's `rdeps` and Nx's affected use, and it
// is what survives contact with real code. Symbol-level precision is a research problem.
//
// Zero dependencies — ships inside scaffolded repos.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '__pycache__', 'venv', '.venv'])
const TS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

// ── the import graph ────────────────────────────────────────────────────────────
/** Every source file under `root`, repo-relative POSIX. */
export function sourceFiles(root, dirs = ['src', 'app', 'lib', 'tests', 'test']) {
  const out = []
  for (const d of dirs) {
    const abs = join(root, d)
    if (!existsSync(abs)) continue
    walk(abs, (p) => CODE.test(p) && out.push(relative(root, p).split(sep).join('/')))
  }
  // Root-level entry points too (cli.js, server.ts, index.ts, main.py). NOT recursive — just the
  // top level. Missing these hides the most important dependent there is: the thing that runs.
  // Found by running this on a real repo and noticing cli.js absent from its own graph.
  try {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (e.isFile() && CODE.test(e.name)) out.push(e.name)
    }
  } catch {
    /* unreadable root — the dirs above are still useful */
  }
  return [...new Set(out)].sort()
}

function walk(dir, fn) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, fn)
    else fn(p)
  }
}

/**
 * Extract the RELATIVE imports of one file. Package imports are ignored on purpose — they are not
 * in-repo blast radius, and resolving them would mean reading node_modules.
 */
export function importsOf(root, relPath) {
  let text
  try {
    text = readFileSync(join(root, relPath), 'utf8')
  } catch {
    return []
  }
  const out = new Set()
  const isPy = relPath.endsWith('.py')

  if (isPy) {
    // from .foo import x   |   from ..pkg.mod import x
    for (const m of text.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import\s/gm)) {
      const up = m[1].length - 1
      const parts = (m[2] || '').split('.').filter(Boolean)
      const base = dirname(join(root, relPath))
      const target = resolve(base, '../'.repeat(up) || '.', ...parts)
      addPy(root, target, out)
    }
  } else {
    // import x from './foo'  |  require('./foo')  |  export * from '../bar'
    const pats = [
      /\bfrom\s+['"](\.[^'"]+)['"]/g,
      /\bimport\s+['"](\.[^'"]+)['"]/g,
      /\brequire\(\s*['"](\.[^'"]+)['"]\s*\)/g,
      /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    ]
    for (const re of pats) {
      for (const m of text.matchAll(re)) {
        addTs(root, resolve(dirname(join(root, relPath)), m[1]), out)
      }
    }
  }
  return [...out]
}

function addTs(root, abs, out) {
  const bare = abs.replace(/\.(js|mjs|cjs)$/, '') // TS imports often carry a .js specifier
  for (const cand of [abs, ...TS_EXT.map((e) => bare + e), ...TS_EXT.map((e) => join(bare, 'index' + e))]) {
    if (existsSync(cand) && CODE.test(cand)) return out.add(relative(root, cand).split(sep).join('/'))
  }
}

function addPy(root, abs, out) {
  for (const cand of [abs + '.py', join(abs, '__init__.py')]) {
    if (existsSync(cand)) return out.add(relative(root, cand).split(sep).join('/'))
  }
}

/** file → [files it imports] */
export function buildGraph(root) {
  const g = {}
  for (const f of sourceFiles(root)) g[f] = importsOf(root, f)
  return g
}

/** file → [files that import it] — the direction blast radius actually needs. */
export function reverseGraph(graph) {
  const r = {}
  for (const [importer, targets] of Object.entries(graph)) {
    for (const t of targets) (r[t] ??= []).push(importer)
  }
  for (const k of Object.keys(r)) r[k] = [...new Set(r[k])].sort()
  return r
}

/**
 * Who depends on `changed`, breadth-first, depth-limited.
 * Depth-limited because a transitive closure over a real repo returns "everything", which tells
 * you nothing — the same reason Bazel's rdeps takes an optional depth bound.
 */
export function dependents(reverse, changed, depth = 2) {
  const seen = new Set(changed)
  const levels = []
  let frontier = changed
  for (let d = 0; d < depth; d++) {
    const next = []
    for (const f of frontier) {
      for (const importer of reverse[f] ?? []) {
        if (seen.has(importer)) continue
        seen.add(importer)
        next.push(importer)
      }
    }
    if (next.length === 0) break
    levels.push(next.sort())
    frontier = next
  }
  return levels
}

// ── what changed ────────────────────────────────────────────────────────────────
/** Changed source files: working tree vs HEAD, or vs `base` when given. */
export function changedFiles(root, base = null) {
  const args = base ? ['diff', '--name-only', base, '--'] : ['diff', '--name-only', 'HEAD', '--']
  // stdio 'pipe' on stderr: in a repo with no commits `git diff HEAD` writes "fatal: bad revision
  // 'HEAD'" straight to the terminal, which reads as a crash in a command that recovers fine.
  const run = (a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  try {
    out = run(args)
    if (!out.trim() && !base) out = run(['diff', '--name-only', '--cached', '--'])
  } catch {
    // no commits yet, not a repo, or a bad base — all mean "nothing to report", not an error
    try {
      out = base ? '' : run(['diff', '--name-only', '--cached', '--'])
    } catch {
      return []
    }
  }
  return out.split('\n').map((s) => s.trim()).filter((p) => p && CODE.test(p))
}

// ── the cross-service + business halves (already-shipped artifacts) ─────────────
export function serviceImpact(root, service) {
  const mapPath = join(root, 'knowledge', 'map', 'services.json')
  if (!existsSync(mapPath)) return null
  let map
  try {
    map = JSON.parse(readFileSync(mapPath, 'utf8'))
  } catch {
    return null
  }
  const me = map.services?.[service]
  if (!me) return { unknownService: service, known: Object.keys(map.services ?? {}) }

  const caps = {}
  const capPath = join(root, 'knowledge', 'map', 'capabilities.json')
  if (existsSync(capPath)) {
    try {
      Object.assign(caps, JSON.parse(readFileSync(capPath, 'utf8')).capabilities ?? {})
    } catch {
      /* optional */
    }
  }
  return {
    service,
    provides: me.provides ?? [],
    consumedBy: me.consumedBy ?? [],
    capabilities: (me.capabilities ?? []).map((c) => ({ name: c, ...(caps[c] ?? {}) })),
  }
}

/** Did this change touch the published contract or a route? Then consumers are in scope. */
export function touchesContract(changed) {
  return changed.some((p) => /(^|\/)(routes?|controllers?|api)\//.test(p) || /openapi\.(json|yaml)$/.test(p))
}

// ── the blind spots, stated ─────────────────────────────────────────────────────
// A report that implies completeness is worse than one that admits its edges. These are the
// documented failure modes of static impact analysis, not hypotheticals.
export const BLIND_SPOTS = [
  'queue/event consumers (no import edge exists)',
  'feature flags and runtime config that reroute behaviour',
  'string-keyed routing, DI containers, and reflection',
  'ORM lazy-loading and dynamic model access',
  'anything reached only through a package boundary or HTTP call not in the map',
]
