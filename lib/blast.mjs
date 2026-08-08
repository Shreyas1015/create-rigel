// lib/blast.mjs — PLAN-017. Blast radius delivered BEFORE the edit, not after.
//
// `create-rigel impact` already computes who depends on what, and it deliberately never blocks —
// "this is a lens, not a gate." That is the right call for a build-time tool, but it means the fact
// arrives after the edit is written, when changing course is expensive. This module supplies the
// same fact at the one moment it is cheap: the tool call that is about to modify the file.
//
// (Prior art: ECC's PreToolUse gates. Their write-up also records the failure mode — repeated
// denials pushed sessions into "a degenerate repetition loop" and they had to condense the message.
// That warning shaped the two rules below more than the feature did.)
//
// WHAT THIS IS, HONESTLY. It denies the FIRST edit to a high-blast-radius file in a session and
// spends the denial handing over the importer list. The retry goes through. So it is not a gate —
// it cannot stop a determined edit, and it is not trying to. It makes it impossible to change a
// load-bearing file *without having been shown what depends on it*. The gate is still where
// enforcement lives; this is where the facts live. Conflating the two would be the overclaim.
//
// WHY THE THRESHOLD IS RELATIVE. An absolute cutoff does not transfer between repos: measured on
// two real ones, ">= 8 dependents" denied 48% of edits in a densely-coupled service and 8% in a
// library. A relative rule gives a guarantee instead of a guess — **at most `pct` of a repo's files
// can ever trip this, whatever the repo's shape.** Bounded noise is the entire design constraint;
// a hook that fires constantly gets deleted, and it takes the useful hooks with it.

// Zero dependencies — this file is stamped into every scaffolded repo.
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

/** Only files that can plausibly be load-bearing. Tests and configs are noise here. */
const SOURCE_RE = /^(src|app|lib)\//

export const DEFAULTS = {
  pct: 0.15, // ceiling: at most 15% of source files can ever be "hot"
  floor: 3, // below this there is nothing worth interrupting anyone for
  depth: 2, // matches `impact` — a full transitive closure returns "everything", which says nothing
}

/**
 * Rank every source file by how much depends on it.
 * @returns Map<path, {count, direct, levels}> for the hot set only, ordered hottest first
 */
export function hotSet(root, opts = {}) {
  const { pct, floor, depth } = { ...DEFAULTS, ...opts }
  const graph = buildGraph(root)
  const reverse = reverseGraph(graph)
  const files = Object.keys(graph).filter((f) => SOURCE_RE.test(f))

  const ranked = files
    .map((f) => {
      const levels = dependents(reverse, [f], depth)
      return { f, levels, direct: levels[0] ?? [], count: levels.flat().length }
    })
    .sort((a, b) => b.count - a.count || a.f.localeCompare(b.f))

  const cut = Math.max(1, Math.ceil(files.length * pct))
  const hot = new Map()
  for (const r of ranked.slice(0, cut)) {
    if (r.count < floor) break // ranked descending — once below the floor, the rest are too
    hot.set(r.f, { count: r.count, direct: r.direct, levels: r.levels })
  }
  return { hot, total: files.length, cut }
}

/**
 * Should editing `relPath` be interrupted, and with what facts?
 * @returns {{hot: boolean, count?: number, direct?: string[], indirect?: number, total?: number}}
 */
export function assess(root, relPath, opts = {}) {
  if (!SOURCE_RE.test(relPath)) return { hot: false }
  const { hot, total } = hotSet(root, opts)
  const h = hot.get(relPath)
  if (!h) return { hot: false }
  return {
    hot: true,
    count: h.count,
    direct: h.direct,
    indirect: h.count - h.direct.length,
    total,
  }
}

/** Absolute or relative path from a tool payload → repo-relative POSIX path, or null. */
export function toRepoPath(root, file) {
  if (!file) return null
  const norm = String(file).replace(/\\/g, '/')
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  if (norm.startsWith(base + '/')) return norm.slice(base.length + 1)
  if (norm.startsWith('/')) return null // absolute, but outside the repo — not ours to judge
  return norm.replace(/^\.\//, '')
}

/**
 * The deny message. Kept SHORT on purpose — ECC's own notes say a long repeated denial is what
 * drove sessions into a repetition loop. Names at most five importers; the count carries the rest.
 */
export function denyMessage(rel, a) {
  const shown = a.direct.slice(0, 5)
  const more = a.direct.length - shown.length
  return [
    `BLAST RADIUS — ${rel} is imported by ${a.count} of ${a.total} source files.`,
    ``,
    `  directly: ${shown.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`,
    a.indirect > 0 ? `  indirectly: ${a.indirect} further file(s)` : null,
    ``,
    `Before you change its behaviour, check those callers still hold. If this is a`,
    `breaking change, it belongs in the spec's impact block, not in one edit.`,
    ``,
    `Retry the same edit to proceed — this fires once per file per session.`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}
