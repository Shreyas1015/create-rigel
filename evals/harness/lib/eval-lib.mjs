// evals/harness/lib/eval-lib.mjs
//
// Shared, dependency-free statistics + IO for the PLAN-004 golden-set harness. Kept plain
// Node so the repo's zero-dependency invariant holds and none of this leaks into the
// published package (evals/ is excluded from package.json "files").
//
// Contents:
//   - cohenKappa      inter-rater / judge-vs-human agreement, PER DIMENSION (never pooled)
//   - signTest        two-sided sign test over paired deltas (champion/challenger)
//   - balancedSample  stratified ~50/50 selection per class for calibration sets
//   - passAtK / perCheckPassRate   golden-trial scoring primitives
//   - readJson/writeJson/listDirs  small IO helpers

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// ── Cohen's κ ────────────────────────────────────────────────────────────────
// Two raters, categorical labels. Returns { kappa, po, pe, n, degenerate }.
// κ = (po - pe) / (1 - pe). Degenerate case (both raters used a single category, so
// pe === 1): κ is mathematically undefined; we report po-based 1/0 and flag it, never
// silently emit a misleading number.
export function cohenKappa(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error('cohenKappa: a and b must be equal-length arrays')
  }
  const n = a.length
  if (n === 0) return { kappa: null, po: null, pe: null, n: 0, degenerate: true }

  let agree = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++
  const po = agree / n

  const cats = new Set([...a, ...b])
  let pe = 0
  for (const c of cats) {
    const pa = a.filter((x) => x === c).length / n
    const pb = b.filter((x) => x === c).length / n
    pe += pa * pb
  }

  if (1 - pe === 0) {
    return { kappa: po === 1 ? 1 : 0, po, pe, n, degenerate: true }
  }
  return { kappa: (po - pe) / (1 - pe), po, pe, n, degenerate: false }
}

// ── Binomial helpers + two-sided sign test ───────────────────────────────────
function logFactorial(n) {
  let s = 0
  for (let i = 2; i <= n; i++) s += Math.log(i)
  return s
}
function logChoose(n, k) {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}
// P(X <= k) for X ~ Binomial(n, p). Log-space per term for numerical stability.
export function binomialCdf(k, n, p) {
  if (k < 0) return 0
  if (k >= n) return 1
  let sum = 0
  for (let i = 0; i <= k; i++) {
    sum += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p))
  }
  return Math.min(1, sum)
}

// Two-sided sign test over paired deltas (challenger − baseline per item). Zeros are
// dropped (the standard sign-test treatment of ties). Returns direction + p-value.
export function signTest(deltas, alpha = 0.05) {
  let pos = 0
  let neg = 0
  for (const d of deltas) {
    if (d > 0) pos++
    else if (d < 0) neg++
  }
  const n = pos + neg
  if (n === 0) {
    return { pos, neg, nNonzero: 0, pValue: 1, significant: false, direction: 'none' }
  }
  const kMin = Math.min(pos, neg)
  const pValue = Math.min(1, 2 * binomialCdf(kMin, n, 0.5))
  const direction = pos === neg ? 'none' : pos > neg ? 'up' : 'down'
  return { pos, neg, nNonzero: n, pValue, significant: pValue < alpha, direction }
}

// ── Stratified sampling for calibration sets ─────────────────────────────────
export function groupBy(items, keyFn) {
  const groups = new Map()
  for (const it of items) {
    const k = keyFn(it)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(it)
  }
  return groups
}
// Take up to `perClass` items from EACH class so rare classes aren't drowned out
// (κ variance is dominated by the minority class). Deterministic order (no RNG, so
// results are reproducible in CI). Reports per-class counts actually taken.
export function balancedSample(items, keyFn, perClass) {
  const groups = groupBy(items, keyFn)
  const sample = []
  const counts = {}
  for (const [k, list] of groups) {
    const take = list.slice(0, perClass)
    sample.push(...take)
    counts[k] = take.length
  }
  return { sample, counts }
}

// ── Golden-trial scoring primitives ──────────────────────────────────────────
// trials: array of k objects mapping checkId -> 'PASS' | 'FAIL' | 'ERRORED'.
// ERRORED (budget abort / infra flake) is neither a pass nor a regression signal.
export function passAtK(trials, checkId) {
  const seen = trials.map((t) => t[checkId]).filter((v) => v !== undefined && v !== 'ERRORED')
  if (seen.length === 0) return { passK: false, passRate: null, n: 0 }
  const passes = seen.filter((v) => v === 'PASS').length
  return { passK: passes === seen.length, passRate: passes / seen.length, n: seen.length }
}
export function allCheckIds(trials) {
  const ids = new Set()
  for (const t of trials) for (const k of Object.keys(t)) ids.add(k)
  return [...ids]
}

// ── IO ───────────────────────────────────────────────────────────────────────
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}
export function writeJson(path, data) {
  const dir = dirname(path)
  if (dir) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}
export function listDirs(path) {
  if (!existsSync(path)) return []
  return readdirSync(path).filter((e) => statSync(`${path}/${e}`).isDirectory())
}
export function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}
