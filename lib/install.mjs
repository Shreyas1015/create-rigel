// lib/install.mjs — PLAN-013 AC-0. The placement policy: Rigel never writes over a file it did not
// write.
//
// WHY THIS EXISTS. `materialize()` copies a template tree with `fs.cp({recursive:true})`, and `cp`'s
// `force` option defaults to **true** — verified on Node v24.16.0, not assumed. So every collision
// was a silent overwrite. Running `create-rigel .` in an existing repo destroyed the user's
// `.gitignore` (the template ships one, so the collision is guaranteed) with no prompt, no backup
// and no report. There is no undo outside git.
//
// The rule, and it is the whole file:
//
//     absent            → write it, and record it as ours
//     present, same     → don't write, still record it (we would have written exactly this)
//     present, DIFFERENT→ DECLINE. Never write, never record, never own.
//
// A declined file is not a conflict. A conflict means "we both changed a file from a common base";
// at first contact there is no common base, so calling it one would produce a `.rigel-new` sidecar
// per collision — and sidecars are a fatal gate failure, which would make adoption red by
// construction. Declined is its own outcome.
//
// Greenfield is the degenerate case where every path is `absent`, so scaffold and adopt share this
// one policy instead of forking. That preserves the invariant at cli.js — scaffold and update must
// produce the same tree, or an update would compare against files a scaffold never wrote.

import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hashFile, walkFiles } from './manifest.mjs'

/**
 * Decide what may be placed, without writing anything.
 *
 * @param srcRoot   a materialised template tree
 * @param destRoot  the repo we are placing into (may be empty, may be someone's 5-year-old app)
 * @returns {{added: string[], identical: string[], declined: string[]}} repo-relative, sorted
 */
export function planInstall(srcRoot, destRoot) {
  const added = []
  const identical = []
  const declined = []

  for (const rel of walkFiles(srcRoot)) {
    const target = join(destRoot, rel)
    if (!existsSync(target)) {
      added.push(rel)
      continue
    }
    // Same bytes is not a collision — we would have written exactly this, so claiming it is honest.
    if (hashFile(target) === hashFile(join(srcRoot, rel))) identical.push(rel)
    else declined.push(rel)
  }

  return { added: added.sort(), identical: identical.sort(), declined: declined.sort() }
}

/**
 * Write only what `planInstall` allowed.
 *
 * `force:false, errorOnExist:true` on every copy: a collision here means the plan and the disk
 * disagree (something changed underneath us), and that must be an error rather than a silent skip
 * OR a silent clobber. Verified on Node v24.16.0 to throw ERR_FS_CP_EEXIST and leave the file intact.
 */
export async function install(srcRoot, destRoot, plan) {
  for (const rel of plan.added) {
    const to = join(destRoot, rel)
    await mkdir(dirname(to), { recursive: true })
    await cp(join(srcRoot, rel), to, { force: false, errorOnExist: true })
  }
  // Files Rigel may claim: the ones it just wrote, plus the ones already byte-identical to its own.
  // Declined paths are deliberately absent — Rigel does not own what it did not write.
  return [...plan.added, ...plan.identical].sort()
}

/**
 * Files that make Rigel's own VERIFICATION honest. Adopting a repo where one of these collided is
 * adoption in name only: the verifier would be the user's file, so `verify:rigel` would report on
 * something other than Rigel's contract, and every green after that is meaningless.
 *
 * Deliberately NARROW. An earlier version matched every `scripts/**\/rigel-*` file, which caught
 * `scripts/lib/rigel-evals.mjs` — the red-green/AC-vector helper. That is a real file to care about
 * but it does not decide whether verification means anything, and treating it as core made the
 * commonest case (a repo adopted by an OLDER Rigel) impossible to adopt at all. Found by running
 * adoption against a real one.
 */
export const CORE_RE = /^scripts\/(rigel[-_]verify|lib\/rigel[-_]manifest)\.(mjs|py)$/

/**
 * Other Rigel-authored harness files that already exist and DIFFER. In a repo Rigel never touched
 * these simply don't appear; when they do, this is a repo an older Rigel scaffolded and the copies
 * here are stale. They are still declined — adoption never overwrites — but staying silent would
 * leave new scripts paired with an old shared library, which breaks in confusing ways.
 */
export const HARNESS_RE = /^scripts\/(lib\/)?[\w-]+\.(mjs|py)$/

/** Which declined paths are load-bearing for Rigel's own honesty? */
export function coreCollisions(plan) {
  return plan.declined.filter((p) => CORE_RE.test(p))
}

/** Declined Rigel harness files that are not core — a stale-harness signal, not a blocker. */
export function staleHarness(plan) {
  return plan.declined.filter((p) => HARNESS_RE.test(p) && !CORE_RE.test(p))
}

/** One line per outcome, in the CLI's existing report voice. Empty string when nothing happened. */
export function summarizeInstall(plan) {
  const lines = []
  if (plan.added.length) lines.push(`  ${plan.added.length} file(s) added`)
  if (plan.identical.length) lines.push(`  ${plan.identical.length} already identical`)
  if (plan.declined.length) {
    lines.push(`  ${plan.declined.length} left alone (yours — Rigel will not own or rewrite these):`)
    for (const p of plan.declined.slice(0, 10)) lines.push(`      ${p}`)
    if (plan.declined.length > 10) lines.push(`      … and ${plan.declined.length - 10} more`)
  }
  return lines.join('\n')
}
