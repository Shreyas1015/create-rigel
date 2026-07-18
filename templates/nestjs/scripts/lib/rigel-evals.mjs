// scripts/lib/rigel-evals.mjs
// Shared helpers for the deterministic-eval scripts (redgreen-record, ac-vector).
// Pure Node (no deps) so it runs anywhere the template is scaffolded.
//
// The linkage this file resolves:
//   docs/exec-plans/active/PLAN-XXX.md   (the active plan)
//     → **Spec:** docs/product-specs/ready/SPEC-XXX.md   (the linked spec)
//       → ## Acceptance Criteria  → AC-1, AC-2, …          (the AC-IDs)
//         → tests/acceptance/SPEC-XXX/*.test.ts            (title contains the AC-ID)
//
// Everything is deterministic and content-based — we grade what was produced, not how.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const AC_ID_RE = /\bAC-\d+\b/g

const ACTIVE_DIR = 'docs/exec-plans/active'
const READY_DIR = 'docs/product-specs/ready'
export const ACCEPTANCE_DIR = 'tests/acceptance'
export const REDGREEN_DIR = '.rigel/redgreen'
export const RESULTS_DIR = '.rigel/ac-results'

/** First active plan file, or null on a fresh repo (no plan yet). */
export function findActivePlan() {
  if (!existsSync(ACTIVE_DIR)) return null
  const plans = readdirSync(ACTIVE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
  return plans.length ? join(ACTIVE_DIR, plans[0]) : null
}

/** SPEC-IDs referenced by a plan — the `**Spec:**` line first, else any SPEC-\d+. */
export function specIdsFromPlan(planText) {
  const specLine = planText.match(/\*\*Spec:\*\*\s*(.+)/)
  const source = specLine ? specLine[1] : planText
  const ids = new Set()
  for (const m of source.matchAll(/\bSPEC-\d+\b/g)) ids.add(m[0])
  return [...ids]
}

/** Resolve a SPEC-ID to its READY spec file path, or null. */
export function findSpecFile(specId) {
  if (!existsSync(READY_DIR)) return null
  const hit = readdirSync(READY_DIR).find((f) => f.startsWith(specId) && f.endsWith('.md'))
  return hit ? join(READY_DIR, hit) : null
}

/**
 * Parse the `## Acceptance Criteria` section into [{ id, text }].
 * Accepts `- [ ] **AC-1:** text` and tolerant variants.
 */
export function parseAcceptanceCriteria(specText) {
  const lines = specText.split('\n')
  const start = lines.findIndex((l) => /^##\s+Acceptance Criteria/i.test(l))
  if (start === -1) return []
  const out = []
  const seen = new Set()
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break // next section
    const m = lines[i].match(/\b(AC-\d+)\b[:*\s]*(.*)$/)
    if (m && !seen.has(m[1])) {
      seen.add(m[1])
      out.push({ id: m[1], text: m[2].replace(/\*/g, '').trim() })
    }
  }
  return out
}

/** Recursively collect *.test.ts under a dir. */
export function testFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...testFiles(full))
    else if (entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

/** AC-IDs whose id appears in any test *title* inside a spec's acceptance dir. */
export function acIdsWithTests(specId) {
  const dir = join(ACCEPTANCE_DIR, specId)
  const found = new Set()
  for (const file of testFiles(dir)) {
    const src = readFileSync(file, 'utf8')
    // Only title strings of describe()/it()/test() count — not comments/imports.
    for (const m of src.matchAll(/\b(?:describe|it|test)\s*\(\s*[`'"]([^`'"]*)[`'"]/g)) {
      for (const ac of m[1].matchAll(AC_ID_RE)) found.add(ac[0])
    }
  }
  return found
}

/**
 * Run a spec's acceptance suite via jest and return a Map<AC-ID, 'passed'|'failed'>.
 * Uses --outputFile so stdout pollution never corrupts the JSON. Jest exiting
 * non-zero (expected when tests are red) is caught — the report is still written.
 */
export function runAcceptanceTests(specId) {
  const dir = join(ACCEPTANCE_DIR, specId)
  mkdirSync('.rigel', { recursive: true })
  const outFile = join('.rigel', `.jest-${specId}.json`)
  // ts-jest's ESM preset needs --experimental-vm-modules on the node process; merge it
  // into NODE_OPTIONS so these scripts run jest correctly regardless of the ambient env.
  const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --experimental-vm-modules`.trim()
  try {
    execFileSync('npx', ['jest', dir, '--json', `--outputFile=${outFile}`, '--silent'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, NODE_OPTIONS: nodeOptions },
    })
  } catch {
    // Non-zero exit is expected when tests fail; the JSON report is still written.
  }
  if (!existsSync(outFile)) return new Map()
  const report = JSON.parse(readFileSync(outFile, 'utf8'))
  const byAc = new Map()
  for (const suite of report.testResults ?? []) {
    for (const a of suite.assertionResults ?? []) {
      const full = [...(a.ancestorTitles ?? []), a.title].join(' ')
      const ids = full.match(AC_ID_RE)
      if (!ids) continue
      for (const id of ids) {
        // A single passing test is enough to mark the AC passed.
        const prev = byAc.get(id)
        if (a.status === 'passed') byAc.set(id, 'passed')
        else if (prev !== 'passed') byAc.set(id, 'failed')
      }
    }
  }
  return byAc
}

export function readRedGreen(specId) {
  const f = join(REDGREEN_DIR, `${specId}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}

export function writeJson(path, data) {
  const dir = path.slice(0, path.lastIndexOf('/'))
  if (dir) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

export function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Resolve the active plan → its single primary spec. Returns
 * { planPath, specId, specFile, acs } or null if nothing is active yet.
 * Throws only on a genuinely broken linkage (plan present but spec unresolvable).
 */
export function resolveActiveSpec() {
  const planPath = findActivePlan()
  if (!planPath) return null
  const planText = readFileSync(planPath, 'utf8')
  const specIds = specIdsFromPlan(planText)
  if (!specIds.length) return null
  const specId = specIds[0]
  const specFile = findSpecFile(specId)
  if (!specFile) throw new Error(`Active plan references ${specId} but no READY spec file found in ${READY_DIR}`)
  const acs = parseAcceptanceCriteria(readFileSync(specFile, 'utf8'))
  return { planPath, planText, specId, specFile, acs }
}
