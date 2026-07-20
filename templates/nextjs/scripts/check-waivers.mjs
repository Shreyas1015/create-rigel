#!/usr/bin/env node
// check-waivers.mjs (PLAN-005 AC-4)
//
// Waivers are auditable, not escape hatches: every `impeccable-disable[-line|-next-line]`
// marker MUST carry a REASON. A bare waiver (rule ids but no reason) fails this check, so
// it fails the gate. Also prints the total waiver count for QUALITY_SCORE.md's design domain.
//
// Reason syntax (per Impeccable): text after `--` (HTML comments) or `:` (line/next-line):
//   <!-- impeccable-disable overused-font -- exported brand doc -->
//   // impeccable-disable-next-line bounce-easing: intentional, matches brand motion
// A marker with rule ids but no `--`/`:` reason is rejected.

import { readdirSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['src', 'app', 'tests', 'styles']
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html', '.md', '.mdx', '.vue', '.svelte'])
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.git'])
const MARKER = /impeccable-disable(?:-line|-next-line)?\b([^\n*]*)/g

let total = 0
const bare = []

function walk(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p)
      continue
    }
    if (!EXT.has(extname(e.name))) continue
    const src = readFileSync(p, 'utf8')
    let m
    while ((m = MARKER.exec(src)) !== null) {
      total++
      // A reason is any non-empty text after `--` or `:` following the rule ids.
      if (!/(--|:)\s*\S+/.test(m[1])) bare.push(`${p} → ${m[0].trim()}`)
    }
  }
}

for (const r of ROOTS) walk(r)

if (bare.length > 0) {
  console.error(`✗ ${bare.length} impeccable waiver(s) missing a reason (PLAN-005 AC-4 requires one):`)
  for (const b of bare) console.error(`  - ${b}`)
  console.error('\n  Add a reason, e.g.:  // impeccable-disable-next-line <rule>: <why this is intentional>')
  process.exit(1)
}

console.log(`✓ impeccable waivers: ${total} total, all carry a reason.`)
process.exit(0)
