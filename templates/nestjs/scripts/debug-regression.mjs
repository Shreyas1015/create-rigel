#!/usr/bin/env node
// scripts/debug-regression.mjs — a /debug session must end in a regression test, mechanically.
//
// WHY THIS EXISTS. /debug already forbids guessing, but its output was a fixed bug and a written
// record — nothing stopped the same bug returning. A fix without a test is a fix with a shelf life.
// Prose in the skill can't enforce that ("if it can't fail a build, it's a doc"), so this does.
//
// THE RULE, and why it is scoped this narrowly:
//   A failure signature that has recurred (seen >= 2 times in .rigel/gate-failures.jsonl) must
//   have a regression test proven red-then-green.
// Recurrence is exactly when /debug fires, so the gate asks for a test precisely when a human
// would. A FIRST failure needs nothing — demanding a test for every transient gate failure would
// be noise, and a check that cries wolf gets switched off, taking the working checks with it.
//
// RED BEFORE GREEN, for the same reason redgreen-record exists: a test written after the fix has
// never been observed failing, so it may assert nothing at all. `red` REJECTS a test that already
// passes. That ordering is the whole proof.
//
// Usage:
//   node scripts/debug-regression.mjs red   <signature> --test <path>   # before the fix; must FAIL
//   node scripts/debug-regression.mjs green <signature>                 # after the fix; must PASS
//   node scripts/debug-regression.mjs check                             # the gate step
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { gitHead, writeJson } from './lib/rigel-evals.mjs'

const DIR = '.rigel/regressions'
const FAILURES = '.rigel/gate-failures.jsonl'
const THRESHOLD = 2 // == /debug's trigger: the SAME signature failing twice

const die = (m) => {
  console.error(`❌ debug-regression: ${m}`)
  process.exit(1)
}
// A signature is `gate:discriminator`; ':' and '/' are not filename-safe.
const slug = (sig) => sig.replace(/[^\w.-]+/g, '-')
const recPath = (sig) => join(DIR, `${slug(sig)}.json`)

/**
 * Run ONE test file and report what actually happened.
 *
 * The exit code alone is NOT enough: jest exits 1 both when an assertion fails and when the suite
 * fails to even parse. Trusting it would accept a file of gibberish as proof that a bug reproduces
 * — a check that verifies nothing, which is worse than no check. So read the structured report and
 * require that a test really RAN.
 */
function runTest(path) {
  const r = spawnSync('npx', ['jest', '--silent', '--json', '--runTestsByPath', path], { encoding: 'utf8' })
  const raw = (r.stdout || '').slice((r.stdout || '').indexOf('{'))
  let j
  try {
    j = JSON.parse(raw)
  } catch {
    die(`jest produced no readable report for ${path} (exit ${r.status}) — a TOOL failure, not a test result\n      ${(r.stderr || '').trim().split('\n').slice(-2).join(' ')}`)
  }
  const execError = (j.testResults ?? []).find((t) => t.testExecError || (t.status === 'failed' && !t.assertionResults?.length))
  if (execError) {
    die(
      `${path} did not RUN — the suite failed to load (syntax error, bad import, missing module).\n` +
        `      That is not a reproduction of the bug. Fix the test file first.\n      ${(execError.message || '').trim().split('\n')[0]}`,
    )
  }
  if ((j.numTotalTests ?? 0) === 0) {
    die(`${path} contains ZERO tests — an empty file cannot reproduce anything (LSN-0004: a check that verifies nothing must fail loud)`)
  }
  return (j.numFailedTests ?? 0) === 0
}

/** signature -> times seen, from the append-only failure log. */
function seenCounts() {
  if (!existsSync(FAILURES)) return {}
  const counts = {}
  for (const line of readFileSync(FAILURES, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const sig = JSON.parse(line).signature
      if (sig) counts[sig] = (counts[sig] ?? 0) + 1
    } catch {
      /* a malformed line is not a reason to stop counting the rest */
    }
  }
  return counts
}

const [mode, sig] = process.argv.slice(2)

if (mode === 'red') {
  if (!sig) die('usage: debug-regression.mjs red <signature> --test <path>')
  const i = process.argv.indexOf('--test')
  const test = i === -1 ? null : process.argv[i + 1]
  if (!test) die('--test <path> is required — the regression test must exist BEFORE the fix')
  if (!existsSync(test)) die(`no such test file: ${test}`)

  if (runTest(test)) {
    die(
      `${test} PASSES already, so it does not reproduce ${sig}.\n` +
        `      A test written after the fix proves nothing — it may assert nothing at all.\n` +
        `      Write the test so it FAILS on the current bug, then record red.`,
    )
  }
  mkdirSync(DIR, { recursive: true })
  writeJson(recPath(sig), { signature: sig, test, red: { commit: gitHead(), ts: new Date().toISOString() }, green: null })
  console.log(`✓ red recorded: ${test} reproduces ${sig}`)
  process.exit(0)
}

if (mode === 'green') {
  if (!sig) die('usage: debug-regression.mjs green <signature>')
  const p = recPath(sig)
  if (!existsSync(p)) die(`no red proof for ${sig} — run \`red\` BEFORE the fix, or the test proves nothing`)
  const rec = JSON.parse(readFileSync(p, 'utf8'))
  if (!existsSync(rec.test)) die(`the recorded test is gone: ${rec.test}`)
  if (!runTest(rec.test)) die(`${rec.test} still FAILS — the bug is not fixed yet`)
  rec.green = { commit: gitHead(), ts: new Date().toISOString() }
  writeJson(p, rec)
  console.log(`✓ green recorded: ${rec.test} now passes — ${sig} cannot return silently`)
  process.exit(0)
}

if (mode === 'check' || mode === undefined) {
  const counts = seenCounts()
  const recurring = Object.entries(counts).filter(([, n]) => n >= THRESHOLD)
  if (recurring.length === 0) {
    console.log('  ✓ no recurring failure signatures — no regression test owed')
    process.exit(0)
  }
  let bad = 0
  for (const [s, n] of recurring) {
    const p = recPath(s)
    const rec = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
    if (!rec || !rec.green) {
      bad++
      console.error(`  ✗ ${s} has failed ${n}× but has no regression test proven red→green`)
      console.error(
        `      A recurring bug with no test WILL come back. Write a test that reproduces it, then:\n` +
          `        node scripts/debug-regression.mjs red   ${s} --test <path>   # before the fix\n` +
          `        node scripts/debug-regression.mjs green ${s}                 # after the fix`,
      )
    } else if (!existsSync(rec.test)) {
      bad++
      console.error(`  ✗ ${s}: its regression test ${rec.test} has been DELETED`)
    }
  }
  if (bad) process.exit(1)
  console.log(`  ✓ ${recurring.length} recurring signature(s), each pinned by a regression test`)
  process.exit(0)
}

die(`unknown mode "${mode}" — expected red | green | check`)
