// lib/doctor.mjs — PLAN-013 AC-2. How far is this repo from a healthy Rigel repo?
//
// There is ONE model of a healthy Rigel repo and every repo has a distance from it. Greenfield is
// the point where that distance is zero — not a better product. So doctor reports the SAME sections
// for every repo: a fresh scaffold simply has them all green, and a repo that has drifted (which
// every shipped express repo had, see LSN-0015) does not.
//
// IT NEVER FAILS A BUILD. Exit code is always 0, exactly like `create-rigel impact`. The user is
// standing in a repo where a dozen things may be unwired; a red exit there teaches "rigel is broken"
// and gets it switched off, taking the gates that work with it. Enforcement stays with the gates
// that already block. `--strict` flips that for a team that wants it in their own CI, and is wired
// into nothing by Rigel.
//
// It also runs in a repo with ZERO Rigel files — that is the whole never-adopted case — so it lives
// in this package and imports its own libs rather than shipping into templates.
//
// It PRINTS and never writes.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { MANIFEST_PATH, SCHEMA_VERSION, classify, hashFile, walkFiles } from './manifest.mjs'
import { checkKnowledge } from './knowledge.mjs'
import { sourceFiles, isEnforced } from './impact.mjs'

/** A finding. `state` is 'ok' | 'note' | 'bad'; `fix` is a command the reader can paste. */
const ok = (detail) => ({ state: 'ok', detail })
const note = (detail, fix = null) => ({ state: 'note', detail, fix })
const bad = (detail, fix = null) => ({ state: 'bad', detail, fix })

export function detectState(root) {
  if (!existsSync(root)) return 'greenfield'
  if (readdirSync(root).length === 0) return 'greenfield'
  if (existsSync(join(root, MANIFEST_PATH))) return 'adopted'
  if (existsSync(join(root, '.rigel'))) return 'stale-rigel'
  return 'never-rigel'
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// ── PROVENANCE ──────────────────────────────────────────────────────────────────
function provenance(root) {
  const out = []
  const p = join(root, MANIFEST_PATH)
  if (!existsSync(p)) {
    out.push(bad('no provenance — Rigel cannot tell its files from yours, so it cannot update or verify', 'npx create-rigel adopt'))
    return { findings: out, manifest: null }
  }
  const m = readJsonSafe(p)
  if (!m) {
    out.push(bad(`${MANIFEST_PATH} is not valid JSON`, 'git checkout ' + MANIFEST_PATH))
    return { findings: out, manifest: null }
  }
  if ((m.schemaVersion ?? 0) > SCHEMA_VERSION) {
    out.push(bad(`manifest is schemaVersion ${m.schemaVersion}; this Rigel understands ${SCHEMA_VERSION}`, 'npm i -g create-rigel@latest'))
  }
  const n = Object.keys(m.files ?? {}).length
  if (n === 0) {
    // The verifier now exits 2 on this rather than printing a green. Say the same thing here.
    out.push(bad('manifest records ZERO owned files — `verify:rigel` would check nothing', 'npx create-rigel adopt'))
  } else {
    out.push(ok(`${n} file(s) owned and verifiable · template ${m.template}@${m.updatedWith ?? m.createdWith}`))
  }
  // Version drift is a NOTE, never a failure: rigel-verify deliberately refuses to red-light a repo
  // over somebody else's release schedule, and doctor must not undo that.
  return { findings: out, manifest: m }
}

// ── INTEGRITY ───────────────────────────────────────────────────────────────────
function integrity(root, manifest) {
  const out = []
  if (!manifest) return out
  let edited = 0
  let missing = 0
  for (const [rel, expected] of Object.entries(manifest.files ?? {})) {
    const abs = join(root, rel)
    if (!existsSync(abs)) missing++
    else if (hashFile(abs) !== expected) edited++
  }
  if (missing) out.push(bad(`${missing} owned file(s) deleted`, 'npx create-rigel update'))
  if (edited) out.push(note(`${edited} owned file(s) hand-edited — an update will report them as conflicts`, 'npm run verify:rigel'))
  if (!missing && !edited && Object.keys(manifest.files ?? {}).length) out.push(ok('every owned file is byte-identical'))

  const sidecars = walkFiles(root).filter((p) => p.endsWith('.rigel-new'))
  if (sidecars.length) {
    out.push(bad(`${sidecars.length} unresolved *.rigel-new sidecar(s) — the gate fails while any remain`, 'review each, then delete it'))
  }
  return out
}

// ── WIRING — the stale-Rigel section ────────────────────────────────────────────
/** Every command a package.json script chain actually reaches, following `npm run X` one level. */
function reachableFromGate(scripts) {
  const seen = new Set()
  const walk = (name, depth = 0) => {
    if (depth > 6 || !scripts[name] || seen.has(name)) return
    seen.add(name)
    for (const m of scripts[name].matchAll(/npm run ([\w:-]+)/g)) walk(m[1], depth + 1)
  }
  walk('gate')
  return { names: seen, body: [...seen].map((n) => scripts[n]).join(' && ') }
}

function wiring(root, manifest) {
  const out = []
  const shipped = existsSync(join(root, 'scripts'))
    ? readdirSync(join(root, 'scripts')).filter((f) => /\.(mjs|py)$/.test(f))
    : []
  // Careful with the wording: a repo can have its own scripts/ full of deploy shell. What matters
  // is whether RIGEL's checks are here, not whether the directory exists.
  if (!shipped.some((f) => /^(rigel[-_]|debug[-_]regression|contract[-_]gate|assert-tests)/.test(f))) {
    out.push(bad('none of Rigel\'s check scripts are present — there is no harness to run', 'npx create-rigel adopt'))
    return out
  }

  // The checks worth asking about: each is a gate step in a healthy repo.
  const CHECKS = [
    { file: 'rigel-verify.mjs', py: 'rigel_verify.py', token: 'verify:rigel', what: 'provenance' },
    { file: 'rigel-knowledge.mjs', py: 'rigel_knowledge.py', token: 'knowledge', what: 'knowledge anchors' },
    { file: 'debug-regression.mjs', py: 'debug_regression.py', token: 'debug:regression', what: 'regression tests for recurring failures' },
    { file: 'contract-gate.mjs', py: 'contract_gate.py', token: 'contract:gate', what: 'breaking API changes' },
    { file: 'assert-tests-ran.mjs', py: null, token: 'assert:tests', what: 'the zero-tests guard' },
  ]

  const pkg = readJsonSafe(join(root, 'package.json'))
  const gateSh = existsSync(join(root, 'scripts/gate.sh')) ? readFileSync(join(root, 'scripts/gate.sh'), 'utf8') : ''
  const scripts = pkg?.scripts ?? {}
  const chain = reachableFromGate(scripts)
  const hasGate = Boolean(scripts.gate) || Boolean(gateSh)

  if (!hasGate) {
    out.push(bad('nothing runs the harness: no `gate` script and no scripts/gate.sh', 'see `npx create-rigel adopt` output for the block to paste'))
  }

  // A user's own gate may legitimately compose things we can't parse (npm-run-all, turbo, shell
  // functions). Reporting "wired" when we cannot tell would be the exact false green this phase
  // exists to remove, so say "could not determine" instead.
  const opaque = Boolean(scripts.gate) && /npm-run-all|run-p|run-s|turbo |&&\s*\$\(|source /.test(chain.body)

  for (const c of CHECKS) {
    const present = shipped.includes(c.file) || (c.py && shipped.includes(c.py))
    if (!present) {
      // Absent is its own state, and a different one from unwired. A repo adopted by an OLDER
      // Rigel simply never received these — which is exactly how bookmarks-api ended up with four
      // of today's gate steps missing rather than merely unrun.
      out.push(note(`${c.token} — not present in this repo (${c.what} is unchecked)`, 'npx create-rigel adopt'))
      continue
    }
    const invoked = gateSh
      ? new RegExp(c.py ? `${c.py.replace('.', '\\.')}|${c.token}` : c.token).test(gateSh)
      : chain.body.includes(c.token)
    if (invoked) out.push(ok(`${c.token} — ${c.what}`))
    else if (opaque) out.push(note(`${c.token} — could not determine whether your gate runs it`, `grep -r ${c.token} package.json`))
    else out.push(bad(`${c.token} ships but NOTHING RUNS IT — ${c.what} is unenforced`, `add it to your "gate" script`))
  }

  // And is the gate in CI? A gate only a laptop runs is how every shipped repo drifted (LSN-0015).
  const wf = join(root, '.github/workflows')
  const yamls = existsSync(wf) ? readdirSync(wf).filter((f) => /\.ya?ml$/.test(f)) : []
  const ciRunsGate = yamls.some((f) => {
    const y = readFileSync(join(wf, f), 'utf8')
    return y.split('\n').some((l) => /^\s*(-\s*)?run:.*(npm run gate|scripts\/gate\.sh)/.test(l))
  })
  if (!yamls.length) out.push(note('no CI workflows — the gate runs only where someone types it', 'add .github/workflows/ci.yml'))
  else if (!ciRunsGate) out.push(bad('CI exists but never runs the gate — enforcement is laptop-only', 'add a step: run: npm run gate'))
  else out.push(ok('CI invokes the gate'))

  return out
}

// ── KNOWLEDGE ───────────────────────────────────────────────────────────────────
function knowledge(root) {
  const out = []
  const dir = join(root, 'knowledge')
  if (!existsSync(dir)) {
    out.push(note('no knowledge/ — no glossary, capabilities or service map', 'npx create-rigel adopt'))
    return out
  }
  const stamped = ['scripts/lib/rigel-knowledge-lib.mjs', 'scripts/lib/rigel_knowledge_lib.py']
  if (!stamped.some((p) => existsSync(join(root, p)))) {
    out.push(bad('the anchor checker\'s library is missing — `npm run knowledge` cannot run', 'npx create-rigel update'))
  }
  let res
  try {
    res = checkKnowledge(root, 'knowledge')
  } catch {
    res = null
  }
  if (!res || res.checked === 0) {
    out.push(note('no anchored knowledge entries yet — nothing is checked against the code', '/backfill-knowledge'))
  } else if (res.problems.length) {
    out.push(bad(`${res.problems.length} stale anchor(s) — documented facts no longer match the code`, 'npm run knowledge'))
  } else {
    out.push(ok(`${res.checked} anchor(s) still resolve`))
  }
  if (!existsSync(join(root, '.rigel/service.json'))) {
    out.push(note('no .rigel/service.json — this repo is absent from the company map', 'npx create-rigel facts'))
  }
  if (!existsSync(join(root, 'knowledge/map/services.json'))) {
    out.push(note('no company service map — `impact` cannot name cross-service consumers', 'it arrives from your company layer via `create-rigel update`'))
  }
  return out
}

// ── CONVERGENCE — the distance, made a number ───────────────────────────────────
function convergence(root, manifest) {
  const out = []
  const baseline = manifest?.baseline ?? []

  if (baseline.length) {
    // Notion's ratchet refinement: an exclusion that no longer excludes anything should be removed,
    // so say which ones are now removable rather than letting the list sit forever.
    out.push(note(`${baseline.length} pre-existing file(s) Rigel does not own`, 'npx create-rigel doctor --json | jq .baseline'))
  } else if (manifest?.mode === 'brownfield') {
    out.push(ok('nothing left un-adopted — this repo is indistinguishable from a fresh scaffold'))
  }

  // `sourceFiles` also returns ROOT-level entry points — deliberate for the import graph, where
  // cli.js or server.ts is a real dependent. But eslint.config.mjs and jest.config.ts are config,
  // not application code, and counting them as un-migrated overstates the debt. Only src/ counts.
  const src = sourceFiles(root, ['src']).filter((p) => p.startsWith('src/'))
  if (src.length) {
    const outside = src.filter((p) => !isEnforced(p))
    if (outside.length === 0) out.push(ok(`all ${src.length} source file(s) sit inside Rigel's enforced layers`))
    else {
      out.push(note(
        `${outside.length} of ${src.length} source file(s) are outside Rigel's enforced layers — ` +
          `the layer rules and coverage thresholds do not apply to them`,
        'they migrate as feature work touches them; nothing is enforced retroactively',
      ))
    }
  }
  return out
}

// ── PLACEMENT — what adoption would do (this is the preview) ─────────────────────
export function placement(plan) {
  const out = []
  if (!plan) return out
  if (plan.added.length) out.push(ok(`${plan.added.length} file(s) would be added`))
  if (plan.identical.length) out.push(ok(`${plan.identical.length} already identical`))
  if (plan.declined.length) {
    out.push(note(`${plan.declined.length} would be left alone (yours): ${plan.declined.slice(0, 6).join(', ')}${plan.declined.length > 6 ? ', …' : ''}`))
  }
  out.push(ok('adoption is additive — nothing above is rewritten'))
  return out
}

export const BLIND_SPOTS = [
  'whether CI is actually enabled on the remote, and whether required checks are set',
  'branch protection (needs `gh` — see scripts/check-protection-drift.sh)',
  'runtime config and secrets — a green repo can still be misconfigured',
  'whether your tests assert anything useful (mutation score, not counted here)',
  'anything outside this working tree: other services, queues, infrastructure',
]

/**
 * The whole report, as data. `plan` is an optional install plan for the PLACEMENT section — the
 * caller supplies it because computing one needs a materialised template.
 */
export function diagnose(root, { plan = null } = {}) {
  const state = detectState(root)
  const { findings: prov, manifest } = provenance(root)
  const sections = []
  if (plan) sections.push({ label: 'PLACEMENT', findings: placement(plan) })
  sections.push({ label: 'PROVENANCE', findings: prov })
  const integ = integrity(root, manifest)
  if (integ.length) sections.push({ label: 'INTEGRITY', findings: integ })
  sections.push({ label: 'WIRING', findings: wiring(root, manifest) })
  sections.push({ label: 'KNOWLEDGE', findings: knowledge(root) })
  sections.push({ label: 'CONVERGENCE', findings: convergence(root, manifest) })
  return { state, template: manifest?.template ?? null, mode: manifest?.mode ?? null, sections, blindSpots: BLIND_SPOTS }
}

export function countBad(report) {
  return report.sections.flatMap((s) => s.findings).filter((f) => f.state === 'bad').length
}
