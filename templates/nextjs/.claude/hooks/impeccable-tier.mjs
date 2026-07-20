#!/usr/bin/env node
// impeccable-tier.mjs (PLAN-005 AC-3)
//
// Runs Impeccable's deterministic detector on ONE file and maps its findings to Rigel's
// severity tiers — Impeccable itself has no per-rule severity, so the split lives in
// .claude/hooks/impeccable-severity.json (Rigel-owned):
//   • slop antipatterns (AI tells)  → BLOCKER, exit 2 (agent must fix or waive-with-reason)
//   • everything else (craft)        → advisory warning, exit 0
//
// Chained from post-write.sh AFTER Rigel's own architecture/security blockers, so
// architecture always beats aesthetics. Skips cleanly (exit 0) when Impeccable is not yet
// installed (e.g. before /infra-setup), so it never breaks a bare scaffold.

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = process.argv[2]
if (!file || !existsSync(file)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()

// Rigel severity config sits next to this script.
const cfgPath = join(dirname(fileURLToPath(import.meta.url)), 'impeccable-severity.json')
let slopRules = []
try {
  slopRules = JSON.parse(readFileSync(cfgPath, 'utf8')).slopRules || []
} catch {
  /* no config → treat everything as craft (advisory) */
}

// Run the locally-installed detector (--no-install: never hit the network in a hook).
const res = spawnSync('npx', ['--no-install', 'impeccable', 'detect', '--json', file], {
  cwd: root,
  encoding: 'utf8',
})
// Not installed / errored / no output → skip silently.
if (res.error || typeof res.stdout !== 'string' || res.stdout.trim() === '') process.exit(0)

let findings
try {
  findings = JSON.parse(res.stdout)
} catch {
  process.exit(0)
}
if (!Array.isArray(findings) || findings.length === 0) process.exit(0)

const slop = new Set(slopRules)
const blockers = findings.filter((f) => slop.has(f.antipattern))
const craft = findings.filter((f) => !slop.has(f.antipattern))

// Craft findings are advisory — print to stdout, don't fail.
for (const c of craft) {
  console.log(`⚠ [impeccable/craft] ${c.antipattern} at ${file}:${c.line ?? '?'} — ${c.name}`)
}

// Slop findings block — print to stderr, exit 2 so the agent must fix or waive.
if (blockers.length > 0) {
  for (const b of blockers) {
    console.error(
      `🚫 [impeccable/slop] ${b.antipattern} at ${file}:${b.line ?? '?'} — ${b.name}. ${b.description ?? ''}`
    )
  }
  console.error(
    `   Fix the slop, or waive WITH A REASON (enforced by scripts/check-waivers.mjs):`
  )
  console.error(`   // impeccable-disable-next-line ${blockers[0].antipattern}: <why this is intentional>`)
  process.exit(2)
}

process.exit(0)
