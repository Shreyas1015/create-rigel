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
export function planUpdate({ recorded, mine, theirs, deletedByUser = [] }) {
  const deleted = new Set(deletedByUser)
  const plan = { overwrite: [], drifted: [], conflict: [], added: [], removed: [], keptModified: [], skippedDeleted: [] }

  for (const [p, theirHash] of Object.entries(theirs)) {
    const base = recorded[p]
    const myHash = mine[p] ?? null

    if (deleted.has(p)) { plan.skippedDeleted.push(p); continue }

    if (base === undefined) {           // new in this version
      if (myHash === null) plan.added.push(p)
      else if (myHash === theirHash) continue      // already identical
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
  ]
    .filter(Boolean)
    .join('\n')
}

export function rewriteManifest({ manifest, version, root, ownership }) {
  const next = { ...manifest, updatedWith: version }
  const fresh = {}
  for (const p of walkFiles(root)) {
    if (classify(p, ownership) === 'managed') fresh[p] = hashFile(join(root, p))
  }
  next.files = fresh
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
