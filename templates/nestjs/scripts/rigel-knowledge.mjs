#!/usr/bin/env node
// scripts/rigel-knowledge.mjs — PLAN-009/011. Is the company knowledge still true?
//
// Every domain entry names an anchor — a file or an exported symbol it describes. This resolves
// them against the repo. When a model is renamed and the glossary still describes the old world,
// the build fails.
//
// That is the whole reason prose is allowed in a Rigel repo at all: a wiki rots in silence,
// anchored knowledge rots loudly. It can fail a build, so it isn't "just a doc".
//
// BLOCKING as of v0.13.0 (advisory for one release before that, deliberately — a new gate that
// misfires even once teaches everyone to ignore it).
//
// OWNERSHIP: the whole glossary is distributed to every service, because shared vocabulary is the
// entire point. But a term's code lives in exactly ONE repo, so a term may declare `owner:` and
// only that service resolves its anchors. Everyone else reads it without being held to it. A term
// with no `owner` is checked everywhere, which keeps single-repo projects ceremony-free.
//
//   node scripts/rigel-knowledge.mjs              # blocking
//   node scripts/rigel-knowledge.mjs --advisory   # report only (exit 0) — for a migration window
import { basename } from 'node:path'
import { checkKnowledge } from './lib/rigel-knowledge-lib.mjs'

const advisory = process.argv.includes('--advisory')
const root = process.cwd()
// Same identity `create-rigel facts` uses, so ownership means the same thing everywhere.
const service = basename(root)
const r = checkKnowledge(root, 'knowledge', { service })

const owned = r.skippedNotOwner
  ? ` (${r.skippedNotOwner} anchor(s) belong to other services — read, not verified here)`
  : ''

if (r.checked === 0) {
  console.log(`· rigel knowledge: no anchored entries to verify here${owned}`)
  process.exit(0)
}

if (r.problems.length === 0) {
  console.log(`✓ rigel knowledge: ${r.checked} anchor(s) across ${r.entries.length} entr(ies) still resolve${owned}`)
  process.exit(0)
}

const mark = advisory ? '·' : '✗'
const out = advisory ? console.log : console.error
out(`\n${mark} rigel knowledge: ${r.problems.length} stale anchor(s)\n`)
for (const p of r.problems) out(`  ${mark} ${p}`)
out(`
The code moved and the knowledge did not. Either:
  • update the entry to describe what the code does now,
  • repoint the anchor,
  • add "owner: <the service that owns this code>" if this repo only reads the term, or
  • delete the entry — knowledge nobody maintains is worse than none.
${advisory ? '\n(--advisory: reported, not enforced)\n' : ''}`)

process.exit(advisory ? 0 : 1)
