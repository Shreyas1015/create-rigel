#!/usr/bin/env node
// scripts/rigel-knowledge.mjs — PLAN-009. Is the company knowledge still true?
//
// Every domain entry names an anchor — a file or an exported symbol it describes. This resolves
// them against the repo. When a model is renamed and the glossary still describes the old world,
// this says so.
//
// That is the whole reason prose is allowed in a Rigel repo at all: a wiki rots in silence,
// anchored knowledge rots loudly. It can fail a build, so it isn't "just a doc".
//
// ADVISORY for now (always exits 0, prints what's stale). It flips to blocking one release later —
// a new gate that misfires even once teaches everyone to ignore it.
//
//   node scripts/rigel-knowledge.mjs            # advisory
//   node scripts/rigel-knowledge.mjs --strict   # exit 1 on a dead anchor
import { checkKnowledge } from './lib/rigel-knowledge-lib.mjs'

const strict = process.argv.includes('--strict')
const r = checkKnowledge(process.cwd())

if (r.checked === 0) {
  console.log('· rigel knowledge: no anchored entries yet (add anchors under knowledge/domain/)')
  process.exit(0)
}

if (r.problems.length === 0) {
  console.log(`✓ rigel knowledge: ${r.checked} anchor(s) across ${r.entries.length} entr(ies) still resolve`)
  process.exit(0)
}

const label = strict ? '✗' : '·'
console.log(`\n${label} rigel knowledge: ${r.problems.length} stale anchor(s)\n`)
for (const p of r.problems) console.log(`  ${label} ${p}`)
console.log(`
The code moved and the knowledge did not. Either:
  • update the entry to describe what the code does now, or
  • repoint the anchor, or
  • delete the entry — knowledge nobody maintains is worse than none.
${strict ? '' : '\n(advisory for now — this becomes a blocking check in a later release)\n'}`)

process.exit(strict && r.problems.length ? 1 : 0)
