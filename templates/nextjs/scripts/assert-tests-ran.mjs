#!/usr/bin/env node
// assert-tests-ran.mjs (PLAN-006 AC-1) — zero-tests gate guard.
//
// The class of bug this closes: a test runner that executes 0 tests but still reports success,
// leaving `npm test`/the gate/CI all green (express's jest did exactly this in clean ESM envs).
// A runner that finds nothing must NEVER be indistinguishable from a runner that passed
// everything.
//
// The gate's test step writes a machine-readable results file (jest/vitest `--json` shape, which
// carries `numTotalTests`); this guard reads it and FAILS if the executed count is below the
// floor. A missing file, unparseable JSON, or an `undefined`/non-numeric count FAILS LOUDLY —
// a guard that cannot see a count must never pass.
//
// Usage: node scripts/assert-tests-ran.mjs [results-file] [--floor N]
//   default results-file: .rigel/test-results.json
//   floor also settable via RIGEL_MIN_TESTS (default 1)

import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const floorIdx = args.indexOf('--floor')
const floor = floorIdx !== -1 ? Number(args[floorIdx + 1]) : Number(process.env.RIGEL_MIN_TESTS || 1)
const file = args.find((a) => !a.startsWith('--') && a !== String(floor)) || '.rigel/test-results.json'

function fail(msg) {
  console.error(`✗ zero-tests guard: ${msg}`)
  process.exit(1)
}

let data
try {
  data = JSON.parse(readFileSync(file, 'utf8'))
} catch (e) {
  fail(
    `cannot read test results at "${file}" (${e.code || e.message}). The gate's test step must ` +
      `emit --json results there. A guard that cannot see a count FAILS — it does not pass.`
  )
}

// jest and vitest both expose numTotalTests in their --json output.
const n = data.numTotalTests
if (typeof n !== 'number' || Number.isNaN(n)) {
  fail(`numTotalTests is ${JSON.stringify(n)} (not a number) in "${file}". Failing loudly rather than assuming success.`)
}
if (n < floor) {
  fail(`only ${n} test(s) executed (floor ${floor}). A runner that finds nothing is NOT a pass.`)
}

console.log(`✓ zero-tests guard: ${n} tests executed (floor ${floor}).`)
