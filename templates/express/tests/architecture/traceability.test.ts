/**
 * Architecture test — AC↔test traceability (AC-1, static half) + red-green integrity
 * (AC-4). Runs in the per-layer gate via `jest tests/architecture/`.
 *
 * This enforces the *structural* invariants that must hold from spec-time onward and
 * are safe to check on every gate (they do NOT require the tests to be green yet):
 *   1. Every AC-ID in the active plan's spec has an acceptance test titled with it.
 *   2. Every such AC-ID has a recorded red state in .rigel/redgreen/SPEC-XXX.json.
 *
 * The green PASS/FAIL vector is a feature-completion check (scripts/ac-vector.mjs),
 * not this file — acceptance tests are legitimately red mid-build.
 *
 * A fresh repo (no active plan, or a plan with no spec) skips cleanly, exactly like
 * layers.test.ts, so the suite passes immediately after /infra-setup.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ACTIVE_DIR = 'docs/exec-plans/active'
const READY_DIR = 'docs/product-specs/ready'
const ACCEPTANCE_DIR = 'tests/acceptance'
const REDGREEN_DIR = '.rigel/redgreen'

const AC_ID = /\bAC-\d+\b/g

function firstActivePlan(): string | null {
  if (!existsSync(ACTIVE_DIR)) return null
  const plans = readdirSync(ACTIVE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
  return plans.length ? join(ACTIVE_DIR, plans[0]!) : null
}

function specIdsFromPlan(text: string): string[] {
  const line = text.match(/\*\*Spec:\*\*\s*(.+)/)
  const source = line ? line[1]! : text
  return [...new Set([...source.matchAll(/\bSPEC-\d+\b/g)].map((m) => m[0]))]
}

function findSpecFile(specId: string): string | null {
  if (!existsSync(READY_DIR)) return null
  const hit = readdirSync(READY_DIR).find((f) => f.startsWith(specId) && f.endsWith('.md'))
  return hit ? join(READY_DIR, hit) : null
}

function acIdsInSpec(specText: string): string[] {
  const lines = specText.split('\n')
  const start = lines.findIndex((l) => /^##\s+Acceptance Criteria/i.test(l))
  if (start === -1) return []
  const ids = new Set<string>()
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) break
    for (const m of lines[i]!.matchAll(AC_ID)) ids.add(m[0])
  }
  return [...ids]
}

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...testFiles(full))
    else if (entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

function acIdsWithTests(specId: string): Set<string> {
  const found = new Set<string>()
  for (const file of testFiles(join(ACCEPTANCE_DIR, specId))) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\b(?:describe|it|test)\s*\(\s*[`'"]([^`'"]*)[`'"]/g)) {
      for (const ac of m[1]!.matchAll(AC_ID)) found.add(ac[0])
    }
  }
  return found
}

function readRedGreen(specId: string): { tests?: Record<string, unknown> } | null {
  const f = join(REDGREEN_DIR, `${specId}.json`)
  return existsSync(f)
    ? (JSON.parse(readFileSync(f, 'utf8')) as { tests?: Record<string, unknown> })
    : null
}

const plan = firstActivePlan()
const specId = plan ? specIdsFromPlan(readFileSync(plan, 'utf8'))[0] : undefined
const specFile = specId ? findSpecFile(specId) : null
const acs = specFile ? acIdsInSpec(readFileSync(specFile, 'utf8')) : []

describe('architecture: AC traceability + red-green integrity', () => {
  it('has an active plan and spec, or skips cleanly on a fresh repo', () => {
    // Sanity anchor so the suite is never empty; real assertions are conditional below.
    expect(Array.isArray(acs)).toBe(true)
  })

  const maybe = acs.length ? it : it.skip

  maybe('every spec AC-ID has an acceptance test titled with it (no MISSING)', () => {
    const withTests = acIdsWithTests(specId!)
    const missing = acs.filter((id) => !withTests.has(id))
    expect(missing).toEqual([])
  })

  maybe('every spec AC-ID has a recorded red state (no INVALID)', () => {
    const rg = readRedGreen(specId!)
    const invalid = acs.filter((id) => !rg || !rg.tests || !(id in rg.tests))
    expect(invalid).toEqual([])
  })
})
