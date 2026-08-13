#!/usr/bin/env node
// scripts/grill-record.mjs — prove a spec stopped guessing before its holdout locks.
//
// Usage: npm run grill:record -- SPEC-XXX
//
// `/write-spec` writes acceptance criteria and immediately turns them into tests/acceptance/,
// which the post-write hook then refuses to let anyone edit. So a guess does not stay a paragraph
// — within one skill run it is a locked test, a plan, and a sprint of work. This runs in the gap
// between those two steps, the last moment where being wrong is still cheap.
//
// It refuses a spec that still contains an unanswered question or an unresolved [ASSUMED] marker.
// It cannot judge whether the questions were GOOD — no script can — but it can stop a guess passing
// silently, which is the difference between a convention and a rule. Same contract as
// redgreen:record, which refuses a proof in which a test already passed.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { assess, record } from './lib/rigel-grill.mjs'

const spec = process.argv[2]
if (!spec || !/^SPEC-\d+$/i.test(spec)) {
  console.error('usage: npm run grill:record -- SPEC-XXX')
  process.exit(2)
}

const dirs = ['docs/product-specs/draft', 'docs/product-specs/ready']
let path = null
for (const d of dirs) {
  if (!existsSync(d)) continue
  const f = readdirSync(d).find((n) => n.toUpperCase().startsWith(spec.toUpperCase() + '-') || n.toUpperCase() === `${spec.toUpperCase()}.MD`)
  if (f) { path = join(d, f); break }
}
if (!path) {
  console.error(`✗ no spec file for ${spec} in ${dirs.join(' or ')}`)
  process.exit(1)
}

const r = assess(readFileSync(path, 'utf8'))

if (!r.ok) {
  console.error(`✗ ${spec} is not ready to lock its holdout:\n`)
  for (const p of r.problems) console.error(`  · ${p}`)
  console.error(`
    Every acceptance criterion here becomes a test in tests/acceptance/${spec}/ that the
    post-write hook will not let you edit afterwards. Resolve the above FIRST — this is the
    last point where changing your mind is free.

    Answer each open question with what the human actually said, and for anything they did
    not say, either ask or cut it. Deleting an [ASSUMED] line is a valid answer; shipping it
    is not.
`)
  process.exit(1)
}

mkdirSync('.rigel/grill', { recursive: true })
const out = join('.rigel/grill', `${spec.toUpperCase()}.json`)
writeFileSync(out, JSON.stringify(record(spec.toUpperCase(), r), null, 2) + '\n')
console.log(`✓ ${spec}: ${r.questions.length} question(s) answered, ${r.acs.length} AC(s), 0 assumptions left`)
console.log(`  recorded → ${out}`)
