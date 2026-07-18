#!/usr/bin/env node
// scripts/ac-vector.mjs
//
// AC-1 (traceability gate — the pass/fail vector). Grades the OUTCOME of a feature:
// for every AC-ID in the active plan's spec it emits one of
//
//   PASS     — a test titled with the AC-ID passes, and it was proven red first
//   FAIL     — the test exists and was red, but does not pass yet
//   MISSING  — no acceptance test is titled with this AC-ID
//   INVALID  — a test exists but has no recorded red state (red-green never proven)
//
// The vector is written to .rigel/ac-results/SPEC-XXX.json and appended to the plan's
// Progress Log. Exit is non-zero unless every AC is PASS — so this is a FEATURE
// COMPLETION check (npm run ac:vector / gate:final / garbage-collect), NOT a per-layer
// gate (acceptance tests are legitimately red mid-build). The per-layer gate enforces
// only the static traceability + assertion-integrity arch tests.

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RESULTS_DIR,
  acIdsWithTests,
  readRedGreen,
  resolveActiveSpec,
  runAcceptanceTests,
  writeJson,
} from './lib/rigel-evals.mjs'

const resolved = resolveActiveSpec()
if (!resolved) {
  console.log('ac-vector: no active plan/spec — nothing to grade.')
  process.exit(0)
}
const { planPath, specId, acs } = resolved
if (!acs.length) {
  console.error(`❌ ac-vector: ${specId} has no AC-IDs in its Acceptance Criteria section`)
  process.exit(1)
}

const withTests = acIdsWithTests(specId)
const redgreen = readRedGreen(specId)
const results = runAcceptanceTests(specId)

const vector = acs.map((ac) => {
  let status
  if (!withTests.has(ac.id)) status = 'MISSING'
  else if (!redgreen || !redgreen.tests?.[ac.id]) status = 'INVALID'
  else if (results.get(ac.id) === 'passed') status = 'PASS'
  else status = 'FAIL'
  return { id: ac.id, status, text: ac.text }
})

// Write the machine-readable artifact.
writeJson(join(RESULTS_DIR, `${specId}.json`), {
  specId,
  gradedAt: new Date().toISOString(),
  vector: Object.fromEntries(vector.map((v) => [v.id, v.status])),
})

// Render + append to the plan's Progress Log.
const icon = { PASS: '✅', FAIL: '❌', MISSING: '⚠️', INVALID: '🚫' }
const lines = vector.map((v) => `- ${v.id}: ${v.status} ${icon[v.status] ?? ''}`.trimEnd())
const block = [
  '',
  `### AC vector — ${specId} — ${new Date().toISOString()}`,
  ...lines,
  '',
].join('\n')
appendFileSync(planPath, block)

console.log(`AC vector for ${specId}:`)
for (const v of vector) console.log(`  ${v.id}: ${v.status}`)

const failing = vector.filter((v) => v.status !== 'PASS')
if (failing.length) {
  console.error(`\n❌ ${failing.length}/${vector.length} AC(s) not PASS — feature is not complete.`)
  process.exit(1)
}
console.log(`\n✅ all ${vector.length} AC(s) PASS.`)
