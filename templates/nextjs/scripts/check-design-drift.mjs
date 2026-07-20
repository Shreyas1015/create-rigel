#!/usr/bin/env node
// check-design-drift.mjs (PLAN-005 AC-5)
//
// Ownership split: DESIGN.md owns brand MEANING; tokens.json owns VALUES. This check fails
// if a literal design VALUE (hex color, rgb()/hsl(), or a numeric px length) appears in
// DESIGN.md — any such value is, by definition, a duplicate of or a contradiction with
// tokens.json's authority. Move it to tokens.json and reference the token name instead.
//
// Runs in the gate. Skips cleanly if DESIGN.md doesn't exist yet (bare scaffold).

import { readFileSync } from 'node:fs'

const FILE = 'DESIGN.md'
let md
try {
  md = readFileSync(FILE, 'utf8')
} catch {
  console.log(`No ${FILE} yet — skipping design-drift check.`)
  process.exit(0)
}

const PATTERNS = [
  { name: 'hex color', re: /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g },
  { name: 'rgb()/rgba()', re: /\brgba?\([^)]*\)/gi },
  { name: 'hsl()/hsla()', re: /\bhsla?\([^)]*\)/gi },
  { name: 'px length', re: /\b\d+(?:\.\d+)?px\b/g },
]

const hits = []
md.split('\n').forEach((line, i) => {
  for (const { name, re } of PATTERNS) {
    const found = line.match(re)
    if (found) hits.push(`  ${FILE}:${i + 1}  ${name}: ${found.join(', ')}`)
  }
})

if (hits.length > 0) {
  console.error(`✗ ${FILE} contains literal design VALUES — these belong in tokens.json (PLAN-005 AC-5):`)
  console.error(hits.join('\n'))
  console.error('\n  Move each value into tokens.json and reference the token name in DESIGN.md instead.')
  process.exit(1)
}

console.log(`✓ ${FILE} owns meaning only — no literal values leaked from tokens.json.`)
process.exit(0)
