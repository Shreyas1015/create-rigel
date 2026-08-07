// lib/knowledge.mjs — PLAN-009. Company knowledge that can fail a build.
//
// The problem with every company wiki: it rots in silence. A glossary describes a world that
// stopped existing six months ago and nothing tells you.
//
// The fix is ANCHORING. Every domain entry points at something real in the repo — a file, an
// exported symbol. `rigel knowledge` resolves those anchors and fails when one dies. Prose that
// cannot go stale unnoticed earns its place under the cardinal rule: it can fail a build.
//
// What is NOT anchored, deliberately: business context (a company's purpose isn't in the code) and
// the generated map (it's derived from contracts, so it can't drift by construction).
//
// Zero dependencies — this ships inside scaffolded repos.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const KNOWLEDGE_DIR = 'knowledge'

// ── frontmatter (a deliberately tiny reader — no YAML dependency) ────────────────
/**
 * Parses the leading `---` block. Supports scalars and the one list shape anchors need:
 *   anchors:
 *     - path: src/models/Shipment.model.ts
 *     - symbol: Shipment
 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { data: {}, body: text }
  const out = {}
  let listKey = null
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const item = /^\s*-\s*(\w+)\s*:\s*(.*)$/.exec(raw)
    if (item && listKey) {
      out[listKey].push({ [item[1]]: strip(item[2]) })
      continue
    }
    const kv = /^(\w[\w-]*)\s*:\s*(.*)$/.exec(raw)
    if (!kv) continue
    if (kv[2].trim() === '') {
      listKey = kv[1]
      out[listKey] = []
    } else {
      listKey = null
      out[kv[1]] = strip(kv[2])
    }
  }
  return { data: out, body: text.slice(m[0].length) }
}

const strip = (s) => s.trim().replace(/^["']|["']$/g, '')

// ── anchor resolution ───────────────────────────────────────────────────────────
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb)$/

/**
 * Resolve one anchor against the repo.
 *   { path: "src/models/Shipment.model.ts" }  → that file must exist
 *   { symbol: "Shipment" }                    → must appear as a definition somewhere in src/
 */
export function resolveAnchor(root, anchor, srcIndex) {
  if (anchor.path) {
    return existsSync(join(root, anchor.path))
      ? { ok: true }
      : { ok: false, reason: `path not found: ${anchor.path}` }
  }
  if (anchor.symbol) {
    // About to gate a build, so a definition style we don't recognise becomes a false FAILURE.
    // Covers TS/JS (incl. `let`, `var`, generator `function*`), Python `def`/`class`, Go, Rust.
    const re = new RegExp(
      `\\b(class|interface|type|enum|const|let|var|function\\*?|def|struct|model)\\s+${escapeRe(anchor.symbol)}\\b`,
    )
    const hit = srcIndex.find(({ text }) => re.test(text))
    return hit ? { ok: true } : { ok: false, reason: `symbol not defined anywhere: ${anchor.symbol}` }
  }
  return { ok: false, reason: `anchor has neither "path" nor "symbol"` }
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Read every source file once — anchor checking is O(entries), not O(entries × files). */
export function buildSourceIndex(root, dirs = ['src', 'app', 'lib']) {
  const out = []
  for (const d of dirs) {
    const abs = join(root, d)
    if (!existsSync(abs)) continue
    walk(abs, (p) => {
      if (!CODE_EXT.test(p)) return
      try {
        out.push({ path: relative(root, p).split(sep).join('/'), text: readFileSync(p, 'utf8') })
      } catch {
        /* unreadable/binary — skip */
      }
    })
  }
  return out
}

function walk(dir, fn) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__pycache__' || e.name.startsWith('.')) continue
      walk(p, fn)
    } else fn(p)
  }
}

// ── scanning the knowledge tree ─────────────────────────────────────────────────
/**
 * Check every anchored entry under knowledge/domain/.
 * Returns { checked, entries: [{file, term, anchors: [{anchor, ok, reason}]}], problems: [...] }
 */
export function checkKnowledge(root, knowledgeDir = KNOWLEDGE_DIR, { service = null } = {}) {
  const domain = join(root, knowledgeDir, 'domain')
  const result = { checked: 0, skippedNotOwner: 0, entries: [], problems: [] }
  if (!existsSync(domain)) return result

  const srcIndex = buildSourceIndex(root)
  const files = []
  walk(domain, (p) => p.endsWith('.md') && files.push(p))

  for (const abs of files.sort()) {
    const rel = relative(root, abs).split(sep).join('/')
    const { data } = parseFrontmatter(readFileSync(abs, 'utf8'))
    const anchors = Array.isArray(data.anchors) ? data.anchors : []
    if (anchors.length === 0) continue // context docs and prose need no anchors

    // The WHOLE glossary is distributed to every service — that is the point of shared vocabulary.
    // But a term's code lives in exactly one repo, so only its owner can resolve its anchors.
    // Without this, every consumer would fail on every term it merely reads. `owner` absent means
    // "check everywhere", which keeps a single-repo project working with no ceremony.
    if (data.owner && service && data.owner !== service) {
      result.skippedNotOwner += anchors.length
      continue
    }

    const checks = anchors.map((a) => ({ anchor: a, ...resolveAnchor(root, a, srcIndex) }))
    result.checked += checks.length
    result.entries.push({ file: rel, term: data.term ?? null, anchors: checks })
    for (const c of checks) {
      if (!c.ok) result.problems.push(`${rel}${data.term ? ` (${data.term})` : ''}: ${c.reason}`)
    }
  }
  return result
}

// ── distribution ────────────────────────────────────────────────────────────────
/**
 * Which knowledge files does a given service receive?
 *   business/**            whole — small, and every agent needs it
 *   domain/glossary/**     whole — shared vocabulary is the point of a glossary
 *   domain/contexts/<own>  own only — other services' internals are context bloat
 *   map/**                 whole — this is what makes offline cross-repo reasoning work
 */
export function selectForService(allFiles, context) {
  return allFiles.filter((p) => {
    if (p.startsWith('business/')) return true
    if (p.startsWith('map/')) return true
    if (p.startsWith('domain/glossary/')) return true
    if (p.startsWith('domain/contexts/')) {
      if (!context) return false
      return p === `domain/contexts/${context}.md`
    }
    return p.startsWith('domain/') && !p.includes('/') // a top-level domain/README.md etc
  })
}

export function listKnowledgeFiles(knowledgeRoot) {
  if (!existsSync(knowledgeRoot) || !statSync(knowledgeRoot).isDirectory()) return []
  const out = []
  walk(knowledgeRoot, (p) => out.push(relative(knowledgeRoot, p).split(sep).join('/')))
  return out.sort()
}
