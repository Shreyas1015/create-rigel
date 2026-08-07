#!/usr/bin/env node
// scripts/check-park-list.mjs
//
// LSN-0012 (ENFORCED): first-run-only paths are the ones no component test exercises.
//
// The nextjs template's `/infra-setup` runs `create-next-app`, which REFUSES to run when the
// working directory contains anything outside its own allowlist. So infra-setup first "parks"
// every harness directory to a temp dir and restores it afterwards. That park list is hand-written.
//
// Every time a new top-level directory is added to the template (PLAN-007 added nothing, PLAN-009
// added `knowledge/`), it must be added to the park list too — or the scaffold ABORTS on the very
// first real run, for every new user, while every test in this repo stays green.
//
// This asserts the park list covers what the template actually ships.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TPL = join(ROOT, 'templates', 'nextjs')
// The park list is authored in the SKILL (an agent executes it), not in infra-setup.sh.
const SETUP = join(TPL, '.claude', 'skills', '00-infra-setup', 'SKILL.md')

// create-next-app tolerates these in a non-empty dir; everything else must be parked.
const ALLOWED_BY_CNA = new Set(['.git', '.gitignore', 'gitignore', 'LICENSE', 'README.md', '.npmignore'])

const shipped = readdirSync(TPL).filter((e) => !ALLOWED_BY_CNA.has(e))
const setup = readFileSync(SETUP, 'utf8')

// The park loop: `for f in .claude .github ... docs knowledge \` (possibly line-continued).
// Require the literal `; do` — a bare `do` also matches inside the word "docs".
const m = /for f in ([\s\S]*?);\s*do\b/.exec(setup)
if (!m) {
  console.error('::error::could not find the park loop in the nextjs 00-infra-setup skill')
  process.exit(1)
}
const parked = new Set(m[1].replace(/\\\s*\n/g, ' ').split(/\s+/).filter(Boolean))

const missing = shipped.filter((e) => !parked.has(e))
if (missing.length) {
  console.error(`::error::nextjs park list is missing ${missing.length} shipped top-level entr(ies):`)
  for (const e of missing) console.error(`  ✗ ${e}`)
  console.error(
    [
      '',
      "create-next-app aborts when the directory contains anything it doesn't expect, so /infra-setup",
      'parks these first. An unparked entry kills the scaffold on a user\'s FIRST run — while every',
      'test here stays green (LSN-0012).',
      '',
      'Fix: add them to the "for f in …" park loop in',
      '  templates/nextjs/.claude/skills/00-infra-setup/SKILL.md',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(`Park list: all ${shipped.length} shipped top-level entries are parked. ✓`)
