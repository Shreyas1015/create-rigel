#!/usr/bin/env node
// scripts/redgreen-record.mjs
//
// AC-4 (red-green proof). Run ONCE, right after /write-spec scaffolds a spec's
// acceptance tests and BEFORE any implementation exists. It runs those tests and
// requires every one to FAIL — proving each test actually tests something (a test
// that already passes against the empty tree proves nothing and is rejected).
//
// It records .rigel/redgreen/SPEC-XXX.json (AC-ID → { status:"red", commit }). The
// ac-vector gate later marks any AC lacking a recorded red state as INVALID, so a
// test can never claim its AC without having first been proven red.
//
// Usage:  node scripts/redgreen-record.mjs [SPEC-XXX]
//   With no arg it resolves the spec from the active plan.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACCEPTANCE_DIR,
  REDGREEN_DIR,
  acIdsWithTests,
  findSpecFile,
  gitHead,
  parseAcceptanceCriteria,
  resolveActiveSpec,
  runAcceptanceTests,
  writeJson,
} from './lib/rigel-evals.mjs'
import { readFileSync } from 'node:fs'

function fail(msg) {
  console.error(`❌ redgreen-record: ${msg}`)
  process.exit(1)
}

let specId = process.argv[2]
let acs
if (specId) {
  const specFile = findSpecFile(specId)
  if (!specFile) fail(`no READY spec file found for ${specId}`)
  acs = parseAcceptanceCriteria(readFileSync(specFile, 'utf8'))
} else {
  const resolved = resolveActiveSpec()
  if (!resolved) fail('no active plan/spec to record — pass a SPEC-XXX id explicitly')
  specId = resolved.specId
  acs = resolved.acs
}

if (!acs.length) fail(`${specId} has no AC-IDs in its Acceptance Criteria section`)

const dir = join(ACCEPTANCE_DIR, specId)
if (!existsSync(dir)) fail(`no acceptance tests found at ${dir} — /write-spec must scaffold them first`)

// Every AC must have a test whose title carries its AC-ID.
const withTests = acIdsWithTests(specId)
const missing = acs.filter((ac) => !withTests.has(ac.id)).map((ac) => ac.id)
if (missing.length) fail(`these ACs have no acceptance test titled with their AC-ID: ${missing.join(', ')}`)

console.log(`▶ Running ${specId} acceptance tests against the pre-implementation tree…`)
const results = runAcceptanceTests(specId)

const passedEarly = acs.filter((ac) => results.get(ac.id) === 'passed').map((ac) => ac.id)
if (passedEarly.length) {
  fail(
    `these acceptance tests PASS before any implementation — they prove nothing and must be rewritten to assert real behavior: ${passedEarly.join(
      ', ',
    )}`,
  )
}

const commit = gitHead()
const record = { specId, recordedCommit: commit, tests: {} }
for (const ac of acs) {
  record.tests[ac.id] = { status: 'red', commit }
}
const out = join(REDGREEN_DIR, `${specId}.json`)
writeJson(out, record)
console.log(`✅ red-green recorded: all ${acs.length} acceptance tests fail pre-implementation → ${out}`)
