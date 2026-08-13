#!/usr/bin/env node
// scripts/check-design.mjs — a spec may not ship with decisions nobody made.
//
// The spec says WHAT to build; the plan says in what order. Neither records which engineering
// decisions were taken or why — datastore, consistency, caching, idempotency, retries,
// authorization, retention all get decided implicitly inside /build-layer, by whoever writes that
// layer, with no record and nothing to review. A spec can pass every other gate here and still ship
// an endpoint whose authorization model nobody chose.
//
// WHAT MAKES THIS A GATE AND NOT A TEMPLATE: the required decisions are DERIVED from the spec. It
// already declares its endpoints and entities, so "this spec has a POST endpoint and no idempotency
// decision" is a mechanical fact, not a matter of taste.
//
// Three checks:
//   1. coverage       every trigger the spec fires has a decision
//   2. rejected       every decision names an alternative it turned down
//   3. standard       every citation resolves — WHEN a reference corpus is configured
//
// Check 3 is SKIPPED and SAID TO BE SKIPPED when no corpus is present. Hard-failing over an
// optional reference library would make this a liability on every machine that never opted in, CI
// included — and a gate people must disable is worse than one that does less.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { requiredDecisions, parseDesign, checkDesign } from './lib/rigel-decisions.mjs'
import { loadIndex, resolveRef } from './lib/rigel-design.mjs'

const SPEC_DIRS = ['docs/product-specs/ready', 'docs/product-specs/draft']
const DESIGN_DIR = 'docs/product-specs/design'

const specs = []
for (const d of SPEC_DIRS) {
  if (!existsSync(d)) continue
  for (const f of readdirSync(d)) {
    const m = /^(SPEC-\d+)/i.exec(f)
    if (m && f.endsWith('.md')) specs.push({ id: m[1].toUpperCase(), path: join(d, f) })
  }
}

if (!specs.length) {
  console.log('  · no specs yet — nothing to check')
  process.exit(0)
}

const index = loadIndex(process.cwd())
const resolver = index ? (ref) => resolveRef(index, ref) : null

let failed = 0
const kinds = new Set()
let observedTotal = 0
let decidedTotal = 0

for (const spec of specs) {
  const required = requiredDecisions(readFileSync(spec.path, 'utf8'))
  if (!required.length) continue // no endpoints and no entities — nothing is owed

  const designPath = join(DESIGN_DIR, `${spec.id}.design.yml`)
  if (!existsSync(designPath)) {
    console.error(`  ✗ ${spec.id}: no design decisions recorded (${designPath})`)
    console.error(`      this spec owes ${required.length}: ${required.map((r) => r.id).join(', ')}`)
    console.error(`      run /write-design`)
    kinds.add('missing')
    failed++
    continue
  }

  const { decisions, errors } = parseDesign(readFileSync(designPath, 'utf8'))
  if (errors.length) {
    console.error(`  ✗ ${spec.id}: ${designPath} could not be read`)
    for (const e of errors) console.error(`      ${e}`)
    kinds.add('parse')
    failed++
    continue
  }

  const r = checkDesign({ decisions, required, resolveRef: resolver })
  observedTotal += r.observed
  decidedTotal += r.decided

  if (r.ok) {
    const obs = r.observed ? `, ${r.observed} observed (inherited, unreviewed)` : ''
    console.log(`  ✓ ${spec.id}: ${r.required.length} required decision(s) covered${obs}`)
    continue
  }

  failed++
  for (const p of r.problems) kinds.add(p.kind)
  console.error(`  ✗ ${spec.id}:`)
  for (const p of r.problems) {
    console.error(`      ${p.message}`)
    if (p.detail) console.error(`        ${p.detail.replace(/\n\s*/g, '\n        ')}`)
  }
}

if (!index) {
  console.log(`      · citations not checked — no reference corpus configured`)
  console.log(`        set RIGEL_NOTES_PATH, or run: npx create-rigel design-index`)
}

if (failed) {
  // Report what actually went wrong. A broken citation is not "decisions nobody recorded", and a
  // summary that says otherwise sends the reader looking for the wrong thing.
  const say = (k) => kinds.has(k)
  const lines = [`  ${failed} spec(s) failed the design check.`, '']
  if (say('missing') || say('coverage')) {
    lines.push(
      `    Decisions that are not recorded still get made — inside /build-layer, by whoever`,
      `    writes that layer, with nothing to review. Writing them down is what makes them`,
      `    reviewable, and it costs five minutes.`,
      ``,
    )
  }
  if (say('rejected')) {
    lines.push(`    A decision with no rejected alternative is a default nobody chose. Name one.`, ``)
  }
  if (say('standard')) {
    lines.push(
      `    A citation that does not resolve points at nothing. Find the real one:`,
      `      search_notes("<topic>")   via the design-notes MCP server`,
      ``,
    )
  }
  if (say('parse')) lines.push(`    Fix the design file's syntax — nothing above it was checked.`, ``)
  console.error(lines.join('\n'))
  process.exit(1)
}

if (observedTotal) {
  // The brownfield convergence number. Same shape as `doctor`'s: a measurable distance that shrinks
  // as feature work touches those areas, rather than a migration project nobody funds.
  console.log(`      · ${observedTotal} of ${observedTotal + decidedTotal} decision(s) are observed, not decided — inherited and unreviewed`)
}
process.exit(0)
