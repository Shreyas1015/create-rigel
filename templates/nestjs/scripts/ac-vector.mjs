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

import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RESULTS_DIR,
  acIdsWithTests,
  findActivePlan,
  findSpecFile,
  parseAcceptanceCriteria,
  readRedGreen,
  resolveActiveSpec,
  runAcceptanceTests,
  writeJson,
} from './lib/rigel-evals.mjs'

// Optional explicit spec id (mirrors redgreen:record): `npm run ac:vector -- SPEC-XXX`.
// With no arg it grades the spec resolved from the active plan.
const argSpecId = process.argv[2]

let planPath
let specId
let acs

if (argSpecId) {
  const specFile = findSpecFile(argSpecId)
  if (!specFile) {
    console.error(`❌ ac-vector: no spec file found for ${argSpecId}`)
    process.exit(1)
  }
  specId = argSpecId
  acs = parseAcceptanceCriteria(readFileSync(specFile, 'utf8'))
  planPath = findActivePlan() // append to the active plan's Progress Log when one exists
} else {
  // Distinguish "no active plan at all" (legitimately nothing to grade → exit 0) from
  // "a plan IS active but its **Spec:** id did not resolve" (a false-green trap → exit 1).
  planPath = findActivePlan()
  if (!planPath) {
    console.log('ac-vector: no active plan/spec — nothing to grade.')
    process.exit(0)
  }
  let resolved
  try {
    resolved = resolveActiveSpec()
  } catch (err) {
    console.error(`❌ ac-vector: active plan ${planPath} but its spec is unresolvable — ${err.message}`)
    process.exit(1)
  }
  if (!resolved) {
    console.error(
      `❌ ac-vector: active plan ${planPath} exists but its **Spec:** id did not resolve to a SPEC-<n> id — ` +
        `refusing to exit green without grading. Fix the plan's **Spec:** line ` +
        `(e.g. "**Spec:** docs/product-specs/ready/SPEC-001-name.md"), or grade explicitly: npm run ac:vector -- SPEC-XXX.`,
    )
    process.exit(1)
  }
  planPath = resolved.planPath
  specId = resolved.specId
  acs = resolved.acs
}

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
if (planPath) appendFileSync(planPath, block)

console.log(`AC vector for ${specId}:`)
for (const v of vector) console.log(`  ${v.id}: ${v.status}`)

const failing = vector.filter((v) => v.status !== 'PASS')
if (failing.length) {
  console.error(`\n❌ ${failing.length}/${vector.length} AC(s) not PASS — feature is not complete.`)
  process.exit(1)
}
console.log(`\n✅ all ${vector.length} AC(s) PASS.`)
