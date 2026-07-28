#!/usr/bin/env node
// scripts/rigel-verify.mjs — PLAN-008 AC-2. Has anyone edited a file Rigel owns?
//
// Runs in the gate. Purely local: the manifest already records the sha256 of exactly what Rigel
// wrote, so this is a hash compare — no network, no template download, no re-materialisation.
//
// What it does NOT do, deliberately:
//   - It never fails because a newer create-rigel exists. That is `cruft check`'s antipattern:
//     red-lighting your PR on someone else's release schedule. Staleness produces a scheduled
//     update PR, never a red build.
//   - It never fails on calendar age.
//
// Escape hatch: a waiver in the manifest pinning the exact accepted content, with an expiry.
// An expired waiver FAILS — a temporary exception cannot quietly become permanent.
//
// Exit 0 = clean, 1 = violations, 2 = cannot run.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readManifest, classify, walkFiles, hashFile, MANIFEST_PATH } from './lib/rigel-manifest.mjs'

const root = process.cwd()
const problems = []
const notes = []

// ── the manifest must exist and parse ───────────────────────────────────────────
let manifest
try {
  manifest = readManifest(root)
} catch (e) {
  console.error(`✗ ${MANIFEST_PATH} is not valid JSON: ${e.message}`)
  process.exit(2)
}
if (!manifest) {
  console.error(`✗ ${MANIFEST_PATH} is missing.`)
  console.error('  This repo has lost its provenance — `rigel update` can no longer reach it.')
  console.error('  Restore it from git history; it cannot be regenerated.')
  process.exit(2)
}

const ownership = manifest.ownership ?? { managed: [], seed: [], user: [] }
const recorded = manifest.files ?? {}

// ── waivers: path → { sha256, expires } ─────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const waivers = new Map()
for (const w of manifest.waivers ?? []) {
  if (!w.path || !w.sha256 || !w.reason || !w.owner || !w.expires) {
    problems.push(`waiver for "${w.path ?? '(no path)'}" is incomplete — needs path, sha256, reason, owner, expires`)
    continue
  }
  if (w.expires < today) {
    problems.push(`waiver for "${w.path}" EXPIRED on ${w.expires} (owner ${w.owner}) — re-justify it or take the update`)
    continue
  }
  waivers.set(w.path, w)
}

// ── every file Rigel wrote must still be byte-identical ─────────────────────────
for (const [path, expected] of Object.entries(recorded)) {
  const abs = join(root, path)
  if (!existsSync(abs)) {
    if (waivers.has(path)) continue // deliberately removed, and waived
    problems.push(`missing: ${path} (Rigel owns this file; it was deleted)`)
    continue
  }
  const actual = hashFile(abs)
  if (actual === expected) continue

  const w = waivers.get(path)
  if (w && w.sha256 === actual) {
    notes.push(`waived: ${path} — ${w.reason} (${w.owner}, expires ${w.expires})`)
    continue
  }
  if (w) {
    problems.push(`edited: ${path} — a waiver exists but pins a different version (re-waive the current content)`)
    continue
  }
  problems.push(`edited: ${path} (Rigel owns this file — revert it, or add a waiver)`)
}

// ── files added into Rigel's space ──────────────────────────────────────────────
// Not fatal: a repo may legitimately add its own script. But it will not be updated or protected,
// so say so once rather than letting it look managed.
const onDisk = walkFiles(root)
for (const p of onDisk) {
  if (classify(p, ownership) !== 'managed') continue
  if (p in recorded) continue
  notes.push(`untracked in a managed path: ${p} (Rigel will not update or protect this)`)
}

// ── merge debris must never be committed ────────────────────────────────────────
for (const p of onDisk) {
  if (p.endsWith('.rigel-new')) {
    problems.push(`unresolved update: ${p} — review it against the original, then delete it`)
  }
}
const CONFLICT = /^(<{7}|={7}|>{7})/m
for (const p of Object.keys(recorded)) {
  const abs = join(root, p)
  if (!existsSync(abs)) continue
  if (CONFLICT.test(readFileSync(abs, 'utf8'))) problems.push(`conflict markers committed in ${p}`)
}

// ── report ──────────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  · ${n}`)

if (problems.length === 0) {
  console.log(`✓ rigel verify: ${Object.keys(recorded).length} managed files intact (template ${manifest.template}@${manifest.updatedWith})`)
  process.exit(0)
}

console.error(`\n✗ rigel verify: ${problems.length} problem(s)\n`)
for (const p of problems) console.error(`  ✗ ${p}`)
console.error(`
Rigel owns these files so it can keep them current. To resolve:
  • revert the file, or
  • add a waiver to ${MANIFEST_PATH}:
      { "path": "<path>", "sha256": "<current hash>", "reason": "<why>",
        "owner": "@you", "expires": "YYYY-MM-DD" }
    An expired waiver fails this check again — that is the point.
`)
process.exit(1)
