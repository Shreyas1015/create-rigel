#!/usr/bin/env node
// evals/harness/load-golden.mjs
//
// AC-5 enforcement: "no green reference, no entry." A golden spec may enter the set only
// if it ships a hand-verified reference solution that graded GREEN — gate PASS and every
// AC PASS. The trial harness loads ONLY admitted specs; an un-referenced or red-reference
// spec is refused, so a broken task can never silently pollute the golden set (the
// SWE-bench "30% broken tasks" lesson made mechanical).
//
// Layout per spec:  evals/golden-specs/<id>/{spec.md, meta.json, reference/grade.json}
//   grade.json is the committed result of running the template's own gate + ac:vector on
//   the reference solution: { gate: "PASS", acVector: {AC-1:"PASS",...}, commit, gradedAt }.
//
// Usage:
//   node evals/harness/load-golden.mjs            # report admitted / rejected
//   node evals/harness/load-golden.mjs --assert-all   # exit 1 if ANY spec is not admitted (CI)

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { listDirs, readJson } from './lib/eval-lib.mjs'

const GOLDEN_DIR = 'evals/golden-specs'

export function isGreenGrade(grade) {
  if (!grade || grade.gate !== 'PASS') return false
  const v = grade.acVector
  if (!v || typeof v !== 'object' || Object.keys(v).length === 0) return false
  return Object.values(v).every((s) => s === 'PASS')
}

export function loadGoldenSet(dir = GOLDEN_DIR) {
  const admitted = []
  const rejected = []
  for (const id of listDirs(dir)) {
    const base = join(dir, id)
    const metaPath = join(base, 'meta.json')
    const specPath = join(base, 'spec.md')
    const gradePath = join(base, 'reference', 'grade.json')

    if (!existsSync(metaPath) || !existsSync(specPath)) {
      rejected.push({ id, reason: 'missing meta.json or spec.md' })
      continue
    }
    if (!existsSync(gradePath)) {
      rejected.push({ id, reason: 'no reference/grade.json — reference solution not built/verified' })
      continue
    }
    let grade
    try {
      grade = readJson(gradePath)
    } catch {
      rejected.push({ id, reason: 'reference/grade.json is not valid JSON' })
      continue
    }
    if (!isGreenGrade(grade)) {
      rejected.push({ id, reason: `reference did not grade green (gate=${grade.gate})` })
      continue
    }
    admitted.push({ id, meta: readJson(metaPath), specPath, grade })
  }
  return { admitted, rejected }
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const assertAll = process.argv.includes('--assert-all')
  const { admitted, rejected } = loadGoldenSet()
  console.log(`Golden set: ${admitted.length} admitted, ${rejected.length} rejected`)
  for (const a of admitted) console.log(`  ✓ ${a.id} (${a.meta.stack}, ${a.meta.profile})`)
  for (const r of rejected) console.log(`  ✗ ${r.id} — ${r.reason}`)
  if (assertAll && rejected.length > 0) {
    console.error(`\n❌ --assert-all: ${rejected.length} spec(s) not admitted.`)
    process.exit(1)
  }
}
