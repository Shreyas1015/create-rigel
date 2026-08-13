// lib/update.mjs — PLAN-008 AC-3. Bring a scaffolded repo forward without clobbering user edits.
//
// The manifest records the sha256 of exactly what Rigel last wrote. That single fact removes the
// need to download the old template version and reconstruct a patch (copier/cruft's approach, and
// the source of their `.rej` litter). Three hashes answer every case, entirely offline:
//
//   BASE   = manifest.files[p]      what Rigel wrote last time
//   MINE   = hash(file on disk)     what's there now
//   THEIRS = hash(new template)     what Rigel wants to write
//
//   MINE == BASE                    → untouched → overwrite silently  (~90% of files)
//   MINE != BASE, THEIRS == BASE    → you edited it, upstream didn't  → leave it alone
//   MINE != BASE, THEIRS != BASE    → both changed → sidecar, never clobber
//
// Nothing is ever merged in place, so a bad merge cannot silently eat your edit. The cost is that
// a genuine both-changed file needs a human diff — which is the honest trade.

import { cp, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { classify, hashFile, walkFiles, MANIFEST_PATH } from './manifest.mjs'

// Files Rigel stamps in that don't live in templates/<stack>/ — kept here so scaffold and update
// can never disagree about what a version "contains".
export const STAMPED = [
  { from: (H) => join(H, 'model-routing.json'), to: '.claude/model-routing.json' },
  {
    from: (H, stack) => join(H, 'lib', stack === 'fastapi' ? 'manifest.py' : 'manifest.mjs'),
    to: (stack) => join('scripts', 'lib', stack === 'fastapi' ? 'rigel_manifest.py' : 'rigel-manifest.mjs'),
  },
  // PLAN-009/011: the knowledge checker's library. Per-stack runtime — the check is BLOCKING as of
  // v0.13.0, so fastapi cannot fall back to "skip if node is missing" (that is a false green in a
  // gate). Selecting per stack also stops fastapi receiving an orphan .mjs nothing imports.
  {
    from: (H, stack) => join(H, 'lib', stack === 'fastapi' ? 'knowledge.py' : 'knowledge.mjs'),
    to: (stack) =>
      join('scripts', 'lib', stack === 'fastapi' ? 'rigel_knowledge_lib.py' : 'rigel-knowledge-lib.mjs'),
  },
  // PLAN-015: the MCP declaration checker's library. JS-only — `.mcp.json` is Claude Code's file
  // and Claude Code is a Node program, so even the fastapi template checks it with node.
  {
    from: (H) => join(H, 'lib', 'mcp.mjs'),
    to: () => join('scripts', 'lib', 'rigel-mcp.mjs'),
  },
  // PLAN-016: the swallowed-error scanner. One implementation for all stacks — it reads Python and
  // JS/TS alike, and fastapi's gate.sh already shells out to node for check-mcp.mjs, so there is no
  // second port to keep in sync and therefore no parity test to forget.
  {
    from: (H) => join(H, 'lib', 'silent.mjs'),
    to: () => join('scripts', 'lib', 'rigel-silent.mjs'),
  },
  // PLAN-017: the blast-radius lens the PreToolUse hook imports. Stamped rather than templated for
  // the same reason as the rest — one copy in lib/ that scaffold, adopt and update all place, so a
  // repo scaffolded a year ago and updated today runs the same code as a fresh one.
  {
    from: (H) => join(H, 'lib', 'blast.mjs'),
    to: () => join('scripts', 'lib', 'rigel-blast.mjs'),
  },
  // PLAN-018: the derived resume block the SessionStart hook prints.
  {
    from: (H) => join(H, 'lib', 'resume.mjs'),
    to: () => join('scripts', 'lib', 'rigel-resume.mjs'),
  },
  // PLAN-020: the parse-only checker the Stop hook runs on whatever the turn wrote.
  {
    from: (H) => join(H, 'lib', 'syntax.mjs'),
    to: () => join('scripts', 'lib', 'rigel-syntax.mjs'),
  },
  // PLAN-022: the pre-holdout grill check.
  {
    from: (H) => join(H, 'lib', 'grill.mjs'),
    to: () => join('scripts', 'lib', 'rigel-grill.mjs'),
  },
]

const GENERATED = [/(^|\/)__pycache__$/, /\.py[cod]$/, /\.tsbuildinfo$/, /(^|\/)node_modules$/, /(^|\/)\.next$/, /(^|\/)\.DS_Store$/]
const notGenerated = (src) => !GENERATED.some((re) => re.test(src))

/** Materialise a template version into `dest` exactly as a scaffold would (minus the manifest). */
export async function materialize(HERE, stack, dest) {
  await mkdir(dest, { recursive: true })
  await cp(join(HERE, 'templates', stack), dest, { recursive: true, filter: notGenerated })
  await restoreDotfiles(dest)
  for (const s of STAMPED) {
    const to = join(dest, typeof s.to === 'function' ? s.to(stack) : s.to)
    await mkdir(dirname(to), { recursive: true })
    await cp(s.from(HERE, stack), to)
  }
  return dest
}

// npm strips `.gitignore`, so templates ship `gitignore`; restore the dot.
async function restoreDotfiles(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await restoreDotfiles(full)
    else if (e.name === 'gitignore') await rename(full, join(dir, '.gitignore'))
    else if (e.name === 'npmignore') await rename(full, join(dir, '.npmignore'))
  }
}

// ── the planner (pure — unit-tested) ────────────────────────────────────────────
/**
 * @param recorded      manifest.files            path → BASE hash
 * @param mine          path → hash on disk (null when absent)
 * @param theirs        path → hash in the new version
 * @param deletedByUser paths the user removed on purpose; never resurrected
 */
export function planUpdate({ recorded, mine, theirs, deletedByUser = [], baseline = [] }) {
  const deleted = new Set(deletedByUser)
  const adopted = new Set(baseline)
  const plan = { overwrite: [], drifted: [], conflict: [], added: [], removed: [], keptModified: [], skippedDeleted: [], declined: [] }

  for (const [p, theirHash] of Object.entries(theirs)) {
    const base = recorded[p]
    const myHash = mine[p] ?? null

    if (deleted.has(p)) { plan.skippedDeleted.push(p); continue }

    if (base === undefined) {           // new in this version
      if (myHash === null) plan.added.push(p)
      else if (myHash === theirHash) continue      // already identical
      // PLAN-013: a baselined file was here before Rigel and was never ours. A `conflict` means
      // "we both changed a file from a common base" — there is no common base here, so calling it
      // one would emit a `.rigel-new` sidecar per adopted file, and sidecars are a FATAL gate
      // failure. That would make every adopted repo red by construction. `declined` is its own
      // outcome: left alone, reported, never a sidecar.
      else if (adopted.has(p)) plan.declined.push(p)
      else plan.conflict.push(p)                   // user created a file Rigel now ships
      continue
    }

    if (myHash === null) { plan.skippedDeleted.push(p); continue }  // gone: treat as deliberate
    if (myHash === theirHash) continue                              // already current
    if (myHash === base) { plan.overwrite.push(p); continue }       // untouched → safe
    if (theirHash === base) { plan.drifted.push(p); continue }      // only the user changed it
    plan.conflict.push(p)                                           // both changed
  }

  for (const [p, base] of Object.entries(recorded)) {
    if (p in theirs) continue                       // still shipped
    const myHash = mine[p] ?? null
    if (myHash === null) continue                   // already gone
    if (myHash === base) plan.removed.push(p)       // upstream dropped it, user never touched it
    else plan.keptModified.push(p)                  // user edited it — keep, report
  }

  for (const k of Object.keys(plan)) plan[k].sort()
  return plan
}

export function hashTree(root) {
  const out = {}
  for (const p of walkFiles(root)) {
    if (p === MANIFEST_PATH) continue
    out[p] = hashFile(join(root, p))
  }
  return out
}

/** Managed-only view of a hash map, per the repo's ownership contract. */
export function managedOnly(hashes, ownership) {
  const out = {}
  for (const [p, h] of Object.entries(hashes)) if (classify(p, ownership) === 'managed') out[p] = h
  return out
}

// ── the applier ─────────────────────────────────────────────────────────────────
export async function applyUpdate({ root, theirsDir, plan, conflictMode = 'sidecar' }) {
  const written = []
  const copy = async (p, dest = p) => {
    await mkdir(dirname(join(root, dest)), { recursive: true })
    await cp(join(theirsDir, p), join(root, dest))
    written.push(dest)
  }

  for (const p of [...plan.overwrite, ...plan.added]) await copy(p)

  for (const p of plan.conflict) {
    if (conflictMode === 'theirs') await copy(p)
    else await copy(p, `${p}.rigel-new`) // sidecar: greppable, diffable, and itself a gate
  }

  for (const p of plan.removed) await rm(join(root, p), { force: true })

  return written
}

export function summarize(plan) {
  const line = (label, arr, note = '') =>
    arr.length ? `  ${label} ${arr.length}${note}\n` + arr.map((p) => `      ${p}`).join('\n') : null
  return [
    line('updated: ', plan.overwrite),
    line('new:     ', plan.added),
    line('removed: ', plan.removed),
    line('CONFLICT:', plan.conflict, '  → review each *.rigel-new, then delete it'),
    line('drifted: ', plan.drifted, '  (you edited these; upstream did not change them — left alone)'),
    line('kept:    ', plan.keptModified, '  (upstream dropped these; you had edited them — left alone)'),
    line('skipped: ', plan.skippedDeleted, '  (you deleted these; not resurrected)'),
    line('yours:   ', plan.declined, '  (these predate Rigel; it will not own or rewrite them)'),
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Re-record provenance after an update.
 *
 * PLAN-013: this used to walk the whole disk and claim everything matching a `managed` glob. That
 * meant ownership was acquired by PROXIMITY — a user's own `.github/workflows/deploy.yml` or
 * `scripts/build.sh` became Rigel-owned and gate-enforced after a single `update`, silently and
 * permanently. `rigel-verify` already reports such files correctly ("untracked in a managed path");
 * this function was the only thing destroying that.
 *
 * Ownership is a fact about AUTHORSHIP, so the record is now a function of what Rigel actually
 * wrote: what it already owned (still managed, still present) plus what this update just placed.
 * A file Rigel never wrote is never claimed, no matter which directory it sits in.
 *
 * @param written  repo-relative paths this update actually wrote (plan.overwrite ∪ plan.added)
 */
export function rewriteManifest({ manifest, version, root, ownership, written = [] }) {
  const next = { ...manifest, updatedWith: version }
  const files = {}
  const claim = (p) => {
    if (classify(p, ownership) !== 'managed') return // seed/user stay the team's after scaffold
    const abs = join(root, p)
    if (existsSync(abs)) files[p] = hashFile(abs) // re-hash: this update may have overwritten it
  }
  for (const p of Object.keys(manifest.files ?? {})) claim(p)
  for (const p of written) claim(p)
  next.files = files
  return next
}

export function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function isDirty(root) {
  return existsSync(join(root, '.git'))
}

export async function writeJson(p, obj) {
  await writeFile(p, JSON.stringify(obj, null, 2) + '\n')
}
