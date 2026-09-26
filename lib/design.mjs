// lib/design.mjs — PLAN-023 AC-1/AC-2. A reference corpus you can cite, and check citations against.
//
// A design decision without a citation is an opinion. Rigel already has the machine for turning a
// claim into something checkable — knowledge anchors resolve mechanically or the build fails — and
// this is the same mechanism pointed at engineering decisions: "we chose write-through caching"
// becomes traceable to a documented tradeoff rather than to whoever wrote that layer.
//
// THE CORPUS IS A PLUG. Resolution order, first hit wins:
//
//   1. RIGEL_NOTES_PATH          someone with their own reference library
//   2. .rigel/design-refs.json   a project pinning a specific corpus
//   3. the bundled reference/    everyone else, zero setup
//
// NO CORPUS IS NOT AN ERROR. Citation checking is skipped and SAID to be skipped. A gate that
// hard-failed because an optional reference library was absent would make this feature a liability
// on every machine that never opted in, CI included — and a feature people have to disable is worse
// than one that does less.
//
// THE INDEX IS THE POINT. Walking a corpus at check time would make the gate depend on the corpus
// being present. Instead `design-index` writes paths + heading anchors once (measured on a 358-file
// corpus: 278 KB, 7802 anchors), that file is committed, and citation checking is thereafter
// offline, instant, and works on a machine that has never seen the library.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

export const REFS_PATH = '.rigel/design-refs.json'
const SKIP = new Set(['.git', 'node_modules', 'scraper', '.obsidian', 'images', 'assets'])

/** GitHub-compatible heading slug — the anchor a citation names. */
export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/\\/g, '')
    .replace(/`|\*|_/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Where does this project's corpus live?
 * @returns {{path: string|null, source: 'env'|'project'|'bundled'|'none'}}
 */
export function resolveCorpus(root = process.cwd(), { bundled = null, env = process.env } = {}) {
  const fromEnv = env.RIGEL_NOTES_PATH
  if (fromEnv && existsSync(fromEnv)) return { path: fromEnv, source: 'env' }

  const refs = join(root, REFS_PATH)
  if (existsSync(refs)) {
    try {
      const j = JSON.parse(readFileSync(refs, 'utf8'))
      if (j.corpus && existsSync(j.corpus)) return { path: j.corpus, source: 'project' }
    } catch {
      /* a malformed refs file falls through to the bundled corpus; buildIndex reports the parse */
    }
  }
  if (bundled && existsSync(bundled)) return { path: bundled, source: 'bundled' }
  return { path: null, source: 'none' }
}

/**
 * Walk a markdown corpus into `{ file: [anchor, …] }`.
 * Headings only — never body text. The index is for RESOLVING citations, not for search results,
 * and keeping content out of it is what makes it safe to commit whatever the corpus is.
 */
export function buildIndex(corpusPath) {
  const files = {}
  let anchors = 0

  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name) || e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.md')) {
        const rel = relative(corpusPath, p).split(sep).join('/')
        const text = readFileSync(p, 'utf8')
        const list = []
        for (const m of text.matchAll(/^(#{1,4})\s+(.+?)\s*$/gm)) {
          const a = slug(m[2])
          if (a && !list.includes(a)) list.push(a)
        }
        files[rel] = list
        anchors += list.length
      }
    }
  }
  walk(corpusPath)
  return { files, anchors, count: Object.keys(files).length }
}

/** Load a committed index, or null when the project has none. */
export function loadIndex(root = process.cwd()) {
  const p = join(root, REFS_PATH)
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'))
    return j.files ? j : null
  } catch {
    return null // reported by the caller as unreadable — never as "no citations to check"
  }
}

/**
 * Does `ref` point at something real?
 * Accepted forms:  path/to/note.md          → the file must exist in the index
 *                  path/to/note.md#anchor   → and carry that heading
 *                  topic/note#anchor        → `.md` is optional
 * @returns {{ok: boolean, reason?: string, suggestion?: string}}
 */
export function resolveRef(index, ref) {
  if (!index?.files) return { ok: false, reason: 'no index' }
  const [rawPath, anchor] = String(ref).split('#')
  const candidates = [rawPath, `${rawPath}.md`]

  let file = candidates.find((c) => index.files[c])
  if (!file) {
    // Tolerate a citation that omits the leading topic directory — the corpus layout is the
    // author's business, not the citer's.
    const tail = candidates.find((c) => Object.keys(index.files).some((k) => k.endsWith('/' + c)))
    if (tail) file = Object.keys(index.files).find((k) => k.endsWith('/' + tail))
  }
  if (!file) {
    const near = nearest(Object.keys(index.files), rawPath)
    return { ok: false, reason: `no such note "${rawPath}"`, suggestion: near }
  }
  if (!anchor) return { ok: true }

  const have = index.files[file]
  if (have.includes(anchor)) return { ok: true }
  return {
    ok: false,
    reason: `"${file}" has no section "#${anchor}"`,
    suggestion: nearest(have, anchor),
  }
}

/** Cheap "did you mean" — shared token overlap, no dependency. */
function nearest(pool, want) {
  const w = new Set(slug(want).split('-').filter(Boolean))
  let best = null
  let bestScore = 0
  for (const c of pool) {
    const t = new Set(slug(c).split('-').filter(Boolean))
    let hits = 0
    for (const x of w) if (t.has(x)) hits++
    const score = hits / Math.max(1, w.size)
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return bestScore >= 0.5 ? best : null
}

/**
 * Lexical search over the index — headings only, so it is instant and deterministic.
 * Deliberately not embeddings: a gate cannot depend on a model being reachable, and a few hundred
 * files do not need vectors. Title matches outrank section matches; exact-phrase outranks partial.
 */
export function search(index, query, limit = 8) {
  if (!index?.files) return []
  const terms = slug(query).split('-').filter(Boolean)
  if (!terms.length) return []
  const out = []

  for (const [file, anchors] of Object.entries(index.files)) {
    const fileTokens = slug(file).split('-').filter(Boolean)
    for (const a of anchors) {
      const aTokens = a.split('-').filter(Boolean)
      let score = 0
      for (const t of terms) {
        if (aTokens.includes(t)) score += 3
        else if (a.includes(t)) score += 2
        if (fileTokens.includes(t)) score += 1
      }
      if (a === slug(query)) score += 10 // exact heading match wins outright
      if (score > 0) out.push({ file, anchor: a, ref: `${file}#${a}`, score })
    }
  }
  return out.sort((x, y) => y.score - x.score || x.ref.localeCompare(y.ref)).slice(0, limit)
}

/** Top-level structure of the corpus, for `list_topics`. */
export function topics(index) {
  const t = new Map()
  for (const f of Object.keys(index?.files ?? {})) {
    const parts = f.split('/')
    const key = parts.length > 1 ? parts[0] : '(root)'
    t.set(key, (t.get(key) ?? 0) + 1)
  }
  return [...t.entries()].map(([name, notes]) => ({ name, notes })).sort((a, b) => a.name.localeCompare(b.name))
}

// ── PLAN-024 AC-6: which version of the corpus an index describes ─────────────
//
// The MCP server re-reads the notes every time it starts, so the agent always sees the current
// corpus. The COMMITTED index — what design:check verifies citations against — does not update
// itself. A note renamed or deleted after indexing is then a false green: a citation to a section
// that no longer exists still resolves against the stale file.

/** The corpus's git commit and whether it had uncommitted changes, or null when it is not a repo. */
export function corpusVersion(corpusPath) {
  const git = (args) => execFileSync('git', ['-C', corpusPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    return { commit: git(['rev-parse', '--short', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0 }
  } catch {
    return null // not a git repo, or git absent — the fingerprint still covers it
  }
}

/** A content fingerprint of an index: works for corpora that are not git repos at all. */
export function fingerprint(files) {
  const h = createHash('sha256')
  for (const k of Object.keys(files ?? {}).sort()) h.update(k + '\0' + (files[k] ?? []).join('\0') + '\n')
  return h.digest('hex').slice(0, 16)
}

/**
 * What design:check should verify citations against, and whether the committed index is stale.
 *   corpus present → the LIVE corpus (truthful: a deleted section fails), plus a staleness report
 *   corpus absent  → the committed index (CI), labelled with the commit it reflects
 */
export function citationBasis(root = process.cwd()) {
  const committed = loadIndex(root)
  if (!committed) return { index: null, basis: 'none', stale: null }
  const at = committed.corpusCommit ? `notes@${committed.corpusCommit}` : 'an unversioned index'
  if (!committed.corpus || !existsSync(committed.corpus)) {
    return { index: committed, basis: `committed index (${at}) — the corpus is not present here`, stale: null }
  }
  const live = buildIndex(committed.corpus)
  const now = corpusVersion(committed.corpus)
  if (fingerprint(live.files) === fingerprint(committed.files)) {
    return { index: committed, basis: `live corpus, matching the committed index (${at})`, stale: null }
  }
  const was = committed.files, is = live.files
  const notesRemoved = Object.keys(was).filter((k) => !is[k]).length
  const notesAdded = Object.keys(is).filter((k) => !was[k]).length
  let sectionsRemoved = 0
  for (const [k, anchors] of Object.entries(was)) {
    const cur = new Set(is[k] ?? [])
    for (const a of anchors) if (!cur.has(a)) sectionsRemoved++
  }
  return {
    index: { ...committed, files: is },
    basis: 'the live corpus — the committed index is stale',
    stale: { from: committed.corpusCommit ?? null, to: now?.commit ?? null, notesAdded, notesRemoved, sectionsRemoved },
  }
}
