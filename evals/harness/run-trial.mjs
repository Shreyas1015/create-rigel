#!/usr/bin/env node
// evals/harness/run-trial.mjs
//
// AC-6 — LIVE trial runner (Option B: local Claude Code, no ANTHROPIC_API_KEY; uses the
// machine's existing `claude` auth). Runs k live trials of an ADMITTED golden spec.
//
// Each trial:
//   1. scaffolds a fresh app from create-rigel (the spec's stack),
//   2. plants the frozen spec + the HOLDOUT acceptance tests + red-green proof from the
//      admitted reference (the agent gets the yardstick, never the reference solution),
//   3. hands it to a headless `claude -p` agent under a token budget to build the feature
//      until the gate + ac:vector go green,
//   4. grades the result with the template's own gate + ac:vector, and
//   5. writes a `trial-N.json` that score.mjs consumes.
//
// A trial is COMPLETE only if the agent finished within budget. A budget breach, a scaffold
// failure, or an agent crash marks the trial ERRORED — never a check FAIL. Anthropic's
// correlated-failure guidance: infra noise and budget aborts must not read as agent
// regressions, so score.mjs excludes ERRORED trials from a check's tally.
//
// The in-scaffold working spec id is numeric (SPEC-001 — the harness resolves ids as
// SPEC-\d+, see DF-43) with the golden content; the trial still REPORTS the golden id as
// `specId` so score.mjs groups by the golden spec.
//
// Usage:
//   node evals/harness/run-trial.mjs --spec SPEC-G1-backend --k 3 --budget 1500000 \
//        [--model claude-...] [--out evals/trials/<runId>] [--timeout-min 30] [--keep]
//
// Requires: `claude` on PATH (authenticated); the stack toolchain; for backend specs a
// reachable Postgres/Redis (DATABASE_URL/REDIS_URL honored from the environment).

import { execFileSync, execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson, writeJson } from './lib/eval-lib.mjs'
import { loadGoldenSet } from './load-golden.mjs'

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HARNESS_DIR, '../..') // create-rigel repo root
const CLI = join(REPO_ROOT, 'cli.js')
const WORKING_SPEC_ID = 'SPEC-001' // numeric id the harness will grade (DF-43)

// ─────────────────────────── pure helpers (unit-tested) ───────────────────────────

/** Parse argv into options. Numbers are validated; unknown flags throw. */
export function parseArgs(argv) {
  const o = { spec: null, k: 1, budget: null, model: null, out: null, timeoutMin: 30, keep: false }
  const rest = argv.slice(2)
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--spec') o.spec = rest[++i]
    else if (a === '--k') o.k = Number(rest[++i])
    else if (a === '--budget') o.budget = Number(rest[++i])
    else if (a === '--model') o.model = rest[++i]
    else if (a === '--out') o.out = rest[++i]
    else if (a === '--timeout-min') o.timeoutMin = Number(rest[++i])
    else if (a === '--keep') o.keep = true
    else throw new Error(`unknown arg: ${a}`)
  }
  if (!o.spec) throw new Error('--spec <id> is required')
  if (!Number.isInteger(o.k) || o.k < 1) throw new Error('--k must be a positive integer')
  if (o.budget != null && !(o.budget > 0)) throw new Error('--budget must be > 0')
  if (!Number.isFinite(o.timeoutMin) || o.timeoutMin <= 0) throw new Error('--timeout-min must be > 0')
  return o
}

/** Map a `.rigel/ac-results` vector + a gate boolean into a trial `checks` object.
 *  Anything that isn't an explicit "PASS" (FAIL / MISSING / INVALID / absent) → FAIL. */
export function checksFromAcResults(acResults, gatePass) {
  const checks = { gate: gatePass ? 'PASS' : 'FAIL' }
  const vector = (acResults && acResults.vector) || {}
  for (const [ac, v] of Object.entries(vector)) checks[ac] = v === 'PASS' ? 'PASS' : 'FAIL'
  return checks
}

/** Budget-relevant token usage from `claude --output-format json`. EXCLUDES
 *  `cache_read_input_tokens`: cache reads are cheap and accumulate per turn (context × turns),
 *  so a normal multi-turn build reads tens of millions of cached tokens — counting them makes
 *  every real build look like a runaway (an early live G1 trial billed 44M, ~all cache reads).
 *  We budget on the "fresh" tokens actually processed: input + output + cache_creation.
 *  usageBreakdown() keeps the full picture (incl. cache reads + $) on the trial record. */
export function usageTokens(claudeJson) {
  const u = (claudeJson && claudeJson.usage) || {}
  const n = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0)
  return Number.isFinite(n) ? n : 0
}

/** Full usage picture for the trial record: fresh (budgeted) vs cache-read vs total + $. */
export function usageBreakdown(claudeJson) {
  const u = (claudeJson && claudeJson.usage) || {}
  const fresh = usageTokens(claudeJson)
  const cacheRead = u.cache_read_input_tokens || 0
  return {
    fresh,
    cacheRead,
    total: fresh + cacheRead,
    costUsd: (claudeJson && claudeJson.total_cost_usd) || null,
  }
}

/** Assemble the trial record score.mjs consumes. ERRORED iff the agent aborted/crashed or
 *  the budget was breached; an ERRORED trial's checks are ignored by score.mjs regardless. */
export function assembleTrial({
  trialId,
  specId,
  harnessCommit,
  aborted,
  agentErrored,
  tokenLimit,
  tokensUsed,
  totalTokens,
  costUsd,
  checks,
  judgeAdvisories,
}) {
  const status = aborted || agentErrored ? 'ERRORED' : 'COMPLETE'
  return {
    trialId,
    specId,
    harnessCommit,
    status,
    budget: {
      tokenLimit: tokenLimit ?? null,
      tokensUsed: tokensUsed ?? 0, // fresh tokens (input+output+cache_creation) — the budgeted metric
      totalTokens: totalTokens ?? null, // incl. cache reads — for the record only
      costUsd: costUsd ?? null,
      aborted: !!aborted,
    },
    checks: checks || {},
    judgeAdvisories: judgeAdvisories || {},
  }
}

/** The prompt handed to the headless build agent. It must build (not touch acceptance tests). */
export function buildAgentPrompt(goldenId) {
  return [
    `You are an agent-first engineer. An active spec (${WORKING_SPEC_ID}, the frozen golden spec ${goldenId})`,
    `and its acceptance tests already exist and are RED. Build the feature to make them green.`,
    ``,
    `Run the project's own loop: read .claude/CLAUDE.md and AGENTS.md, run /infra-setup if the`,
    `scaffold isn't set up yet, then /write-plan and /build-layer through every layer until`,
    `\`npm run gate\` passes AND \`npm run ac:vector\` (or gate:final) reports every AC PASS.`,
    ``,
    `Hard rules: do NOT edit anything under tests/acceptance/ or .rigel/redgreen/ (they are the`,
    `holdout yardstick). Do NOT weaken the gate. Follow the skills exactly. Work autonomously —`,
    `do not ask for confirmation. Stop when the gate + ac:vector are green, or when you are truly stuck.`,
  ].join('\n')
}

// ─────────────────────────── orchestration (live-verified separately) ───────────────────────────

function referenceSolutionDir(goldenId) {
  return join(REPO_ROOT, 'evals', 'golden-specs', goldenId, 'reference', 'solution')
}

/** Plant the holdout (spec + acceptance tests + red-green proof) from the reference into a scaffold.
 *  Copies ONLY the yardstick, never the reference implementation source. */
function plantHoldout(appDir, goldenId) {
  const ref = referenceSolutionDir(goldenId)
  const carry = [
    ['docs/product-specs/ready', 'docs/product-specs/ready'],
    ['tests/acceptance', 'tests/acceptance'],
    ['.rigel/redgreen', '.rigel/redgreen'],
  ]
  for (const [from, to] of carry) {
    const src = join(ref, from)
    if (existsSync(src)) {
      mkdirSync(join(appDir, dirname(to)), { recursive: true })
      cpSync(src, join(appDir, to), { recursive: true })
    }
  }
}

function runClaude(appDir, prompt, { model, timeoutMs }) {
  const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions']
  if (model) args.push('--model', model)
  const out = execFileSync('claude', args, {
    cwd: appDir,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

function gradeApp(appDir) {
  let gatePass = false
  try {
    execSync('npm run gate', { cwd: appDir, stdio: 'pipe' })
    gatePass = true
  } catch {
    gatePass = false
  }
  try {
    execSync('npm run ac:vector', { cwd: appDir, stdio: 'pipe' })
  } catch {
    // ac:vector exits non-zero unless every AC is PASS — that's expected data, not an error.
  }
  let acResults = null
  const acPath = join(appDir, '.rigel', 'ac-results', `${WORKING_SPEC_ID}.json`)
  if (existsSync(acPath)) {
    try {
      acResults = readJson(acPath)
    } catch {
      acResults = null
    }
  }
  return { gatePass, acResults }
}

function runOneTrial(i, spec, opts) {
  const scratch = mkdtempSync(join(tmpdir(), `rigel-trial-${spec.id}-`))
  let aborted = false
  let agentErrored = false
  let tokensUsed = 0
  let checks = {}
  let bd = { fresh: 0, cacheRead: 0, total: 0, costUsd: null }
  try {
    execFileSync('node', [CLI, 'app', '--template', spec.meta.stack], { cwd: scratch, stdio: 'pipe' })
    const appDir = join(scratch, 'app')
    plantHoldout(appDir, spec.id)
    let claudeJson = null
    try {
      claudeJson = runClaude(appDir, buildAgentPrompt(spec.id), {
        model: opts.model,
        timeoutMs: opts.timeoutMin * 60 * 1000,
      })
    } catch {
      agentErrored = true // non-zero exit / timeout / killed
    }
    // `claude -p` can exit 0 yet report an API-level error in the result envelope.
    if (claudeJson && claudeJson.is_error === true) agentErrored = true
    if (claudeJson) bd = usageBreakdown(claudeJson)
    tokensUsed = bd.fresh
    if (opts.budget && tokensUsed > opts.budget) aborted = true
    if (!agentErrored) {
      const { gatePass, acResults } = gradeApp(appDir)
      checks = checksFromAcResults(acResults, gatePass)
    }
  } catch {
    agentErrored = true // scaffold/infra flake → ERRORED, not FAILED
  } finally {
    if (!opts.keep) rmSync(scratch, { recursive: true, force: true })
  }
  return assembleTrial({
    trialId: `${spec.id}-${i}`,
    specId: spec.id,
    harnessCommit: opts.harnessCommit,
    aborted,
    agentErrored,
    tokenLimit: opts.budget,
    tokensUsed,
    totalTokens: bd.total,
    costUsd: bd.costUsd,
    checks,
  })
}

function headCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

// ─────────────────────────── CLI ───────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  let opts
  try {
    opts = parseArgs(process.argv)
  } catch (e) {
    console.error(`run-trial: ${e.message}`)
    console.error('usage: run-trial.mjs --spec <SPEC-ID> [--k N] [--budget TOKENS] [--model M] [--out DIR] [--timeout-min N] [--keep]')
    process.exit(2)
  }

  const { admitted } = loadGoldenSet()
  const spec = admitted.find((a) => a.id === opts.spec)
  if (!spec) {
    console.error(`run-trial: '${opts.spec}' is not an ADMITTED golden spec (build its reference first — see load-golden.mjs).`)
    process.exit(1)
  }

  const harnessCommit = headCommit()
  const runId = `${opts.spec}-${(harnessCommit || 'nohash').slice(0, 7)}`
  const outDir = opts.out || join(REPO_ROOT, 'evals', 'trials', runId)
  mkdirSync(outDir, { recursive: true })

  console.log(`run-trial: ${opts.k} trial(s) of ${opts.spec} (${spec.meta.stack}) → ${outDir}`)
  console.log(`  harness=${(harnessCommit || 'nohash').slice(0, 7)} budget=${opts.budget ?? '∞'} model=${opts.model ?? 'default'}`)

  for (let i = 1; i <= opts.k; i++) {
    const trial = runOneTrial(i, { ...spec, harnessCommit }, { ...opts, harnessCommit })
    writeJson(join(outDir, `trial-${i}.json`), trial)
    const c = trial.checks
    const b = trial.budget
    const cost = b.costUsd != null ? `, $${b.costUsd.toFixed(2)}` : ''
    const usage = `fresh=${b.tokensUsed} total=${b.totalTokens ?? '?'}${cost}`
    const summary =
      trial.status === 'ERRORED'
        ? `ERRORED (${usage}, aborted=${b.aborted})`
        : `${trial.checks.gate === 'PASS' ? 'gate✓' : 'gate✗'} ${Object.entries(c).filter(([k]) => k !== 'gate').map(([k, v]) => `${k}:${v}`).join(' ')} (${usage})`
    console.log(`  trial-${i}: ${trial.status} — ${summary}`)
  }

  console.log(`\nWrote ${opts.k} trial(s) to ${outDir}`)
  console.log(`Next: node evals/harness/score.mjs ${outDir}`)
}
