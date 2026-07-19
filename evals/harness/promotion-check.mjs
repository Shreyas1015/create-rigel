#!/usr/bin/env node
// evals/harness/promotion-check.mjs
//
// AC-4 promotion gate. A judge dimension may be `mode: "blocking"` in judge-config.json ONLY
// if it cites a calibration report that:
//   (a) exists,
//   (b) is <= 90 days old (judges drift; a stale calibration is not a license to block), and
//   (c) has promoteEligible === true for that dimension (κ >= threshold; human dims also need
//       rubric-valid human-human κ).
// Any blocking dimension failing these is a violation → exit 1. An all-advisory config passes.
// Wired into repo-integrity.yml so "judges must be calibrated" is a check that fails, not a policy sentence.

import { join } from 'node:path'
import { readJson } from './lib/eval-lib.mjs'

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000

export function checkPromotion(config, { now = Date.now(), readReport = readJson } = {}) {
  const violations = []
  let blockingCount = 0
  for (const [dim, d] of Object.entries(config.dimensions ?? {})) {
    if (d.mode !== 'blocking') continue
    blockingCount++
    if (!d.report) {
      violations.push(`${dim}: mode=blocking but cites no calibration report`)
      continue
    }
    let report
    try {
      report = readReport(d.report)
    } catch {
      violations.push(`${dim}: cited report not found or unreadable (${d.report})`)
      continue
    }
    const ts = Date.parse(report.generatedAt)
    if (Number.isNaN(ts)) {
      violations.push(`${dim}: report has no valid generatedAt`)
      continue
    }
    if (now - ts > MAX_AGE_MS) {
      const days = Math.round((now - ts) / (24 * 60 * 60 * 1000))
      violations.push(`${dim}: calibration report is stale (${days}d > 90d) — recalibrate`)
      continue
    }
    const dr = report.dimensions?.[dim]
    if (!dr) {
      violations.push(`${dim}: cited report has no entry for this dimension`)
      continue
    }
    if (dr.promoteEligible !== true) {
      violations.push(
        `${dim}: not promotion-eligible (judge κ=${dr.judgeKappa}, threshold=${dr.threshold}${dr.reducedConfidence ? ', reduced-confidence' : ''})`,
      )
    }
  }
  return { violations, blockingCount }
}

// ── CLI: node evals/harness/promotion-check.mjs [config.json] ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const configPath = process.argv[2] || join('evals', 'config', 'judge-config.json')
  const config = readJson(configPath)
  const { violations, blockingCount } = checkPromotion(config)
  if (violations.length === 0) {
    console.log(`promotion-check: OK (${blockingCount} blocking dimension(s), all validly calibrated).`)
    process.exit(0)
  }
  console.error('promotion-check: FAILED — a judge dimension is blocking without valid calibration:')
  for (const v of violations) console.error(`  ✗ ${v}`)
  process.exit(1)
}
