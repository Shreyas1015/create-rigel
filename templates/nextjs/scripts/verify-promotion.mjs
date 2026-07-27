#!/usr/bin/env node
// scripts/verify-promotion.mjs — the promotion safety gate (PLAN-007 AC-5).
//
// Roadmap Phase 3 says: "no lesson promotes unless the golden-set score goes up." That gate needs
// accumulated golden-trial data, which does not exist yet (the golden nightly is unscheduled). So
// this implements the LOCAL equivalent, which is available today and is the same discipline:
//
//   A promoted rule must (1) NOT break the working build  — no false positives, and
//                        (2) ACTUALLY catch the failure    — no decorative enforcement.
//
// (1) is mechanical: run the gate. (2) cannot be automated generically — the way you plant a
// violation differs per rule — so it is an explicit human attestation via --tamper-verified.
// Without that flag this EXITS NON-ZERO: the gate fails closed rather than rubber-stamping.
//
// Usage:
//   node scripts/verify-promotion.mjs LSN-0031                      # checks (1), demands (2)
//   node scripts/verify-promotion.mjs LSN-0031 --tamper-verified    # attests (2) was done
//   node scripts/verify-promotion.mjs LSN-0031 --gate "npm run gate"
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const LESSONS = 'docs/design-docs/lessons'
const args = process.argv.slice(2)
const id = args.find((a) => /^LSN-\d+$/i.test(a))
const tamperVerified = args.includes('--tamper-verified')
const gateCmd = args.includes('--gate') ? args[args.indexOf('--gate') + 1] : 'npm run gate'

if (!id) {
  console.error('usage: verify-promotion.mjs <LSN-XXXX> [--tamper-verified] [--gate "<cmd>"]')
  process.exit(2)
}

const file = existsSync(LESSONS) && readdirSync(LESSONS).find((f) => f.toUpperCase().startsWith(id.toUpperCase()))
if (!file) {
  console.error(`✗ no lesson file for ${id} in ${LESSONS}/`)
  process.exit(1)
}
const text = readFileSync(join(LESSONS, file), 'utf8')
const fm = text.split('---')[1] || ''
const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim()
const status = get('status')
const enforcedBy = (get('enforced_by') || 'null').replace(/^["']|["']$/g, '')

console.log(`Promotion check — ${id} (${file})`)
let failed = false
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failed = true
}

// -- lesson state --------------------------------------------------------------
check(
  status === 'DISTILLED' || status === 'ENFORCED',
  `status is ${status} (must be DISTILLED to promote, or ENFORCED when re-verifying)`,
)
check(enforcedBy !== 'null' && enforcedBy !== '', `enforced_by names the actual check: ${enforcedBy}`)
if (status === 'ENFORCED') {
  const body = text.split('---').slice(2).join('---').trim()
  check(
    !/^##\s/m.test(body),
    'prose body deleted (an ENFORCED lesson keeps only frontmatter — the check carries the why)',
  )
}

// -- (1) the rule must not break the working build -----------------------------
process.stdout.write(`  … running gate: ${gateCmd}\n`)
try {
  execSync(gateCmd, { stdio: 'pipe' })
  check(true, 'gate PASSES with the new enforcement (no false positives on clean code)')
} catch {
  check(false, `gate FAILS with the new enforcement — it rejects code that should pass. Fix the rule, not the code.`)
}

// -- (2) the rule must actually catch the failure ------------------------------
if (tamperVerified) {
  check(true, 'tamper test attested: a planted violation was confirmed blocked')
} else {
  console.log('  ✗ tamper test NOT attested')
  console.log('')
  console.log('    Required before promoting — prove the check is not decorative:')
  console.log('      1. Plant a violation the lesson describes (one file, smallest possible).')
  console.log('      2. Run the check. It MUST fail/block (non-zero, or a BLOCKER on the hook).')
  console.log('      3. Revert the plant.')
  console.log('      4. Re-run with --tamper-verified.')
  console.log('')
  console.log('    Every enforcement mechanism ships with a test that tries to defeat it.')
  failed = true
}

console.log('')
if (failed) {
  console.error(`✗ ${id} is NOT cleared for promotion.`)
  process.exit(1)
}
console.log(`✓ ${id} cleared: set status: ENFORCED, keep enforced_by, delete the prose body.`)
