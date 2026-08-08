// lib/impact.mjs — PLAN-011 AC-1. Blast radius: a LENS, never a gate.
//
// Answers "if I change this, what else is involved?" by joining three things Rigel already knows:
//   in-repo    which files import the ones I changed        (reverse import edges)
//   services   who consumes the API I provide                (knowledge/map → consumedBy)
//   business   which capability, whose KPI                   (knowledge/business/capabilities)
//
// WHY THIS NEVER BLOCKS. Impact analysis is conservative by construction — it flags what *might*
// be affected, so it over-reports. And static graphs are blind exactly where it hurts: a queue, a
// feature flag, a string-keyed route. High false-positive rates cause alert fatigue, and teams
// respond by disabling the blocking behaviour. Rigel already refused the OTel service-graph gate
// for this reason. A cry-wolf gate here would cost us the gates that work — which are the asset.
//
// Exactness lives in the contract gate (oasdiff). This provides context. Exit code is always 0.
//
// Granularity is FILE-LEVEL on purpose: that is what Bazel's `rdeps` and Nx's affected use, and it
// is what survives contact with real code. Symbol-level precision is a research problem.
//
// Zero dependencies — ships inside scaffolded repos.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py)$/

// ── which code Rigel's rules actually govern ────────────────────────────────────
// Rigel's layer rules, coverage thresholds and architecture tests are all PATH-SCOPED: they apply
// to these directories and nowhere else. That is what lets an existing repo adopt Rigel without a
// rewrite — code outside them is simply not governed, and the enforced region grows only as work
// moves in.
//
// Defined HERE, once, because `impact` and `doctor` must report the same number. Two copies of a
// list like this is how a check and its report end up disagreeing.
export const ENFORCED_LAYERS = [
  'src/types', 'src/config', 'src/models', 'src/repo', 'src/services',
  'src/runtime', 'src/providers', 'src/utils', 'src/workers',
]

/** Is this file governed by the layer rules and coverage thresholds? */
export function isEnforced(path) {
  return ENFORCED_LAYERS.some((l) => path.startsWith(l + '/'))
}

/** The subset of `paths` Rigel does NOT currently govern — the migration candidates. */
export function unenforced(paths) {
  return paths.filter((p) => CODE.test(p) && !isEnforced(p)).sort()
}

// ── the import graph ────────────────────────────────────────────────────────────
// Lives in blast.mjs, not here. The PreToolUse hook needs the same graph, and stamped libs land
// flat in scripts/lib/ where they have no siblings to import — so the shared half has to sit in the
// stamped leaf, and the CLI lens depends on IT rather than the other way round. Re-exported so
// every existing consumer keeps its import path.
export { sourceFiles, importsOf, buildGraph, reverseGraph, dependents } from './blast.mjs'

// ── what changed ────────────────────────────────────────────────────────────────
/** Changed source files: working tree vs HEAD, or vs `base` when given. */
export function changedFiles(root, base = null) {
  const args = base ? ['diff', '--name-only', base, '--'] : ['diff', '--name-only', 'HEAD', '--']
  // stdio 'pipe' on stderr: in a repo with no commits `git diff HEAD` writes "fatal: bad revision
  // 'HEAD'" straight to the terminal, which reads as a crash in a command that recovers fine.
  const run = (a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  try {
    out = run(args)
    if (!out.trim() && !base) out = run(['diff', '--name-only', '--cached', '--'])
  } catch {
    // no commits yet, not a repo, or a bad base — all mean "nothing to report", not an error
    try {
      out = base ? '' : run(['diff', '--name-only', '--cached', '--'])
    } catch {
      return []
    }
  }
  return out.split('\n').map((s) => s.trim()).filter((p) => p && CODE.test(p))
}

// ── the cross-service + business halves (already-shipped artifacts) ─────────────
export function serviceImpact(root, service) {
  const mapPath = join(root, 'knowledge', 'map', 'services.json')
  if (!existsSync(mapPath)) return null
  let map
  try {
    map = JSON.parse(readFileSync(mapPath, 'utf8'))
  } catch {
    return null
  }
  const me = map.services?.[service]
  if (!me) return { unknownService: service, known: Object.keys(map.services ?? {}) }

  const caps = {}
  const capPath = join(root, 'knowledge', 'map', 'capabilities.json')
  if (existsSync(capPath)) {
    try {
      Object.assign(caps, JSON.parse(readFileSync(capPath, 'utf8')).capabilities ?? {})
    } catch {
      /* optional */
    }
  }
  return {
    service,
    provides: me.provides ?? [],
    consumedBy: me.consumedBy ?? [],
    capabilities: (me.capabilities ?? []).map((c) => ({ name: c, ...(caps[c] ?? {}) })),
  }
}

/** Did this change touch the published contract or a route? Then consumers are in scope. */
export function touchesContract(changed) {
  return changed.some((p) => /(^|\/)(routes?|controllers?|api)\//.test(p) || /openapi\.(json|yaml)$/.test(p))
}

// ── the blind spots, stated ─────────────────────────────────────────────────────
// A report that implies completeness is worse than one that admits its edges. These are the
// documented failure modes of static impact analysis, not hypotheticals.
export const BLIND_SPOTS = [
  'queue/event consumers (no import edge exists)',
  'feature flags and runtime config that reroute behaviour',
  'string-keyed routing, DI containers, and reflection',
  'ORM lazy-loading and dynamic model access',
  'anything reached only through a package boundary or HTTP call not in the map',
]
