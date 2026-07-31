// lib/manifest.mjs — PLAN-008 AC-1. The provenance manifest.
//
// A scaffolded repo must be reachable after day 0. `.rigel/manifest.json` is that return address:
// which template, which version, which company layer, and the sha256 of EXACTLY what Rigel wrote.
//
// That last part is the whole trick. Because Rigel knows what it last wrote, it can tell
// "you never touched this" (→ safe to overwrite silently) from "you edited this" (→ never clobber)
// without a 3-way merge — which is why ~90% of an update needs no conflict handling at all.
//
// It is also why `rigel verify` needs no network and no template download: re-hash the managed
// files on disk and compare. Purely local.
//
// Zero dependencies (Node builtins only) — this ships inside scaffolded repos.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const MANIFEST_PATH = '.rigel/manifest.json'
export const SCHEMA_VERSION = 1

// ── minimal glob ────────────────────────────────────────────────────────────────
// `**` crosses separators, `*` does not, everything else is literal. No negation, no braces:
// an ownership rule that needs those is too clever to be auditable.
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        if (glob[i + 1] === '/') i++ // `**/` also matches zero directories
        re += '.*'
      } else {
        re += '[^/]*'
      }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp('^' + re + '$')
}

export function matchesAny(path, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(path))
}

/** Which bucket does this path fall in? `managed` wins, then `user`, then `seed`. */
export function classify(path, ownership) {
  // The manifest is the record, not the record's subject — it cannot contain its own hash.
  if (path === MANIFEST_PATH) return 'manifest'
  // Update sidecars are transient merge debris. If one were recorded as managed, deleting it —
  // which the gate REQUIRES — would then fail verify as "missing". A deadlock; caught live.
  if (path.endsWith('.rigel-new')) return 'debris'
  if (matchesAny(path, ownership.managed)) return 'managed'
  if (matchesAny(path, ownership.user)) return 'user'
  if (matchesAny(path, ownership.seed)) return 'seed'
  return null // unclassified — reported, never silently assumed owned
}

/** Merge the `common` ownership block with a stack's additions. */
export function resolveOwnership(table, stack) {
  const base = table.common ?? {}
  const extra = table[stack] ?? {}
  const merge = (k) => [...(base[k] ?? []), ...(extra[k] ?? [])]
  return { managed: merge('managed'), seed: merge('seed'), user: merge('user') }
}

// ── file walking + hashing ──────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '__pycache__'])

/** Every file in `root`, as repo-relative POSIX paths. */
export function walkFiles(root, dir = root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walkFiles(root, join(dir, e.name), out)
    } else if (e.isFile()) {
      out.push(relative(root, join(dir, e.name)).split(sep).join('/'))
    }
  }
  return out
}

export function hashFile(absPath) {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex')
}

/** sha256 of every `managed` file present on disk, keyed by repo-relative path. */
export function hashManaged(root, ownership) {
  const files = {}
  for (const p of walkFiles(root).sort()) {
    if (classify(p, ownership) === 'managed') files[p] = hashFile(join(root, p))
  }
  return files
}

// ── build + read ────────────────────────────────────────────────────────────────
export function buildManifest({ root, template, version, source, layer = null, answers = {}, ownership, now }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    template,
    createdWith: version,
    updatedWith: version,
    createdAt: now,
    source,
    layer,
    answers,
    ownership,
    files: hashManaged(root, ownership),
    deletedByUser: [],
    waivers: [],
  }
}

export function readManifest(root = process.cwd()) {
  const p = join(root, MANIFEST_PATH)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function fileExists(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}
