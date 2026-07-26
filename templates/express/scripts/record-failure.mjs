#!/usr/bin/env node
// scripts/record-failure.mjs — append ONE gate failure to .rigel/gate-failures.jsonl.
//
// This is the persistent record /curate consumes (the gate's own stdout is ephemeral). Called
// by the gate-checker for each FAIL item it reports, so recurrence can be counted across plans.
//
// Usage:
//   node scripts/record-failure.mjs <signature> <message> [file[:line]]
//
// signature = {gate}:{stable-discriminator} — STABLE ACROSS FILES so the same class of failure
// in a different file counts as one lesson. Examples:
//   tsc:TS2345 · eslint:no-restricted-imports · arch:isolation-test-missing ·
//   arch:paranoid-missing · arch:file-too-long · assert:zero-tests · ac-vector:AC-fail
import { appendFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const [signature, message, location] = process.argv.slice(2)
if (!signature || !message) {
  console.error('usage: record-failure.mjs <signature> <message> [file[:line]]')
  process.exit(2)
}

mkdirSync('.rigel', { recursive: true })

let plan = null // best-effort active-plan id for the `seen`/first_seen/last_seen bookkeeping
try {
  const f = execSync('ls docs/exec-plans/active/*.md 2>/dev/null | head -1', { encoding: 'utf8' }).trim()
  if (f) plan = (f.match(/PLAN-\d{3}/) || [null])[0]
} catch {}

const [file = null, lineStr] = (location || '').split(':')
const rec = {
  ts: new Date().toISOString(),
  plan,
  signature,
  message,
  file: file || null,
  line: lineStr ? Number(lineStr) : null,
}
appendFileSync('.rigel/gate-failures.jsonl', JSON.stringify(rec) + '\n')
console.log(`recorded gate failure: ${signature}`)
