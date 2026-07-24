#!/usr/bin/env node
// evals/harness/golden-nightly.mjs
//
// AC-7 — the golden nightly. Ties the pieces together: for each ADMITTED golden spec it
// runs k live trials (run-trial.mjs), scores them (score.mjs), compares the scorecard to the
// committed baseline (regress.mjs), and emits a nightly report + one issue payload per
// regression. It is an ALARM, not a gate: it flags replicated worsening for a human to
// confirm from the transcript (METR rule) — it never auto-acts and never edits model-routing.
//
// Option B (default): trials run via the local `claude` CLI — no ANTHROPIC_API_KEY. The
// scheduler that invokes this (.github/workflows/golden-nightly.yml or a local launchd/cron)
// must run where `claude` is authenticated (a dev machine or a self-hosted runner); a
// GitHub-hosted runner has no `claude`, so there it needs ANTHROPIC_API_KEY (Option A) instead.
//
// Baselines live at evals/trials/baselines/<specId>.json (a committed scorecard). The FIRST
// run of a spec has no baseline → no regression is possible; the scorecard is written as the
// new baseline. Updating a baseline afterwards is a deliberate, human-reviewed commit.
//
// Usage:
//   node evals/harness/golden-nightly.mjs [--specs a,b] [--k 3] [--budget 4000000] [--model M]
//   node evals/harness/golden-nightly.mjs --score-only <specId>=<trialDir>[,<specId>=<dir>...]
//     (--score-only skips live trials and scores existing trial dirs — for CI / verification
//      without spawning agents.)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, writeJson } from './lib/eval-lib.mjs'
import { loadGoldenSet } from './load-golden.mjs'
import { loadRun, scoreTrials } from './score.mjs'
import { detectRegressions, issuePayload } from './regress.mjs'

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HARNESS_DIR, '../..')
const TRIALS_ROOT = join(REPO_ROOT, 'evals', 'trials')
const BASELINE_DIR = join(TRIALS_ROOT, 'baselines')
const NIGHTLY_DIR = join(TRIALS_ROOT, 'nightly')

// ─────────────────────────── pure helpers (unit-tested) ───────────────────────────

export function parseArgs(argv) {
  const o = { specs: null, k: 3, budget: null, model: null, scoreOnly: null, date: null }
  const rest = argv.slice(2)
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--specs') o.specs = rest[++i].split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--k') o.k = Number(rest[++i])
    else if (a === '--budget') o.budget = Number(rest[++i])
    else if (a === '--model') o.model = rest[++i]
    else if (a === '--date') o.date = rest[++i] // stamp injected (scripts can't call Date.now under some runtimes)
    else if (a === '--score-only') {
      o.scoreOnly = {}
      for (const pair of rest[++i].split(',')) {
        const [spec, dir] = pair.split('=')
        if (spec && dir) o.scoreOnly[spec.trim()] = dir.trim()
      }
    } else throw new Error(`unknown arg: ${a}`)
  }
  if (!Number.isInteger(o.k) || o.k < 1) throw new Error('--k must be a positive integer')
  return o
}

/** Fold per-spec {scorecard, baseline, regressions} into one nightly report. */
export function buildNightlyReport({ date, harnessCommit, perSpec }) {
  const specs = perSpec.map(({ specId, scorecard, baselineFound, regressions }) => ({
    specId,
    k: scorecard.k,
    erroredTrials: scorecard.erroredTrials,
    // a spec is "green" this run if every non-errored check passed^k
    green: Object.values(scorecard.checks).every((c) => c.n === 0 || c.passK),
    baselineFound,
    regressions: regressions.map((r) => r.check),
  }))
  return {
    date: date ?? null,
    harnessCommit: harnessCommit ?? null,
    specCount: specs.length,
    anyRegression: specs.some((s) => s.regressions.length > 0),
    allGreen: specs.every((s) => s.green),
    specs,
  }
}

export function reportMarkdown(report) {
  const lines = [
    `# Golden nightly — ${report.date ?? '(undated)'}`,
    '',
    `Harness commit: \`${(report.harnessCommit ?? 'unknown').slice(0, 12)}\` · specs: ${report.specCount} · ` +
      `${report.anyRegression ? '⚠️ REGRESSION' : report.allGreen ? '✅ all green' : 'no regression (some non-green)'}`,
    '',
    '| spec | k | green | errored | baseline | regressions |',
    '|---|---|---|---|---|---|',
    ...report.specs.map(
      (s) =>
        `| ${s.specId} | ${s.k} | ${s.green ? '✓' : '✗'} | ${s.erroredTrials} | ${s.baselineFound ? '✓' : '—'} | ${s.regressions.length ? s.regressions.join(', ') : '—'} |`,
    ),
  ]
  return lines.join('\n')
}

// ─────────────────────────── orchestration ───────────────────────────

function headCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function runTrials(specId, opts) {
  const runId = `${specId}-${(opts.harnessCommit || 'nohash').slice(0, 7)}`
  const outDir = join(TRIALS_ROOT, runId)
  const args = ['evals/harness/run-trial.mjs', '--spec', specId, '--k', String(opts.k), '--out', outDir]
  if (opts.budget) args.push('--budget', String(opts.budget))
  if (opts.model) args.push('--model', opts.model)
  execFileSync('node', args, { cwd: REPO_ROOT, stdio: 'inherit' })
  return outDir
}

function baselinePath(specId) {
  return join(BASELINE_DIR, `${specId}.json`)
}

// ─────────────────────────── CLI ───────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  let opts
  try {
    opts = parseArgs(process.argv)
  } catch (e) {
    console.error(`golden-nightly: ${e.message}`)
    process.exit(2)
  }

  const { admitted } = loadGoldenSet()
  let targets = admitted
  if (opts.specs) targets = admitted.filter((a) => opts.specs.includes(a.id))
  if (opts.scoreOnly) targets = admitted.filter((a) => a.id in opts.scoreOnly)
  if (targets.length === 0) {
    console.error('golden-nightly: no admitted golden specs to run (build references first).')
    process.exit(1)
  }

  const harnessCommit = headCommit()
  mkdirSync(BASELINE_DIR, { recursive: true })
  mkdirSync(NIGHTLY_DIR, { recursive: true })

  const perSpec = []
  for (const spec of targets) {
    console.log(`\n── ${spec.id} ──`)
    const trialDir = opts.scoreOnly ? opts.scoreOnly[spec.id] : runTrials(spec.id, { ...opts, harnessCommit })
    const trials = loadRun(trialDir)
    const scorecard = scoreTrials(trials)

    const bPath = baselinePath(spec.id)
    let baseline = null
    let baselineFound = false
    if (existsSync(bPath)) {
      baseline = readJson(bPath)
      baselineFound = true
    }
    const regressions = detectRegressions(scorecard, baseline)

    if (!baselineFound) {
      writeJson(bPath, scorecard) // establish the first baseline; no regression possible
      console.log(`  established baseline → ${bPath}`)
    }
    if (regressions.length > 0) {
      const payload = issuePayload(spec.id, regressions, scorecard)
      writeJson(join(trialDir, 'regression-issue.json'), payload)
      console.log(`  ⚠️  ${regressions.length} regression(s): ${regressions.map((r) => r.check).join(', ')}`)
    } else {
      console.log(`  no regressions${baselineFound ? '' : ' (first run — baseline set)'}`)
    }
    perSpec.push({ specId: spec.id, scorecard, baselineFound, regressions })
  }

  const report = buildNightlyReport({ date: opts.date, harnessCommit, perSpec })
  const stamp = (opts.date || (harnessCommit || 'run').slice(0, 7)).replace(/[^\w.-]/g, '_')
  writeJson(join(NIGHTLY_DIR, `${stamp}.json`), report)
  console.log(`\n${reportMarkdown(report)}`)
  console.log(`\nWrote nightly report → evals/trials/nightly/${stamp}.json`)
  process.exit(report.anyRegression ? 1 : 0)
}
