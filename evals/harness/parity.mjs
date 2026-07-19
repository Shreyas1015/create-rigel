#!/usr/bin/env node
// evals/harness/parity.mjs
//
// AC-9 (reframed): the enforcer/grader agents already run on opus. This experiment asks the
// COST-DOWN question — can a grader run on a CHEAPER tier without losing agreement? Over a
// stratified artifact set, each grader agent is run on opus AND on the cheaper tier; we
// compute per-agent Cohen's κ. A grader may move to the cheaper tier ONLY if:
//   κ ≥ 0.8   AND   zero blocker-severity disagreements.
// Otherwise it stays on opus and the disagreement set is archived.
//
// DATA-GATED: this produces a real decision only once enough stratified gate-FAIL / golden
// artifacts have accumulated. The machinery + threshold are built now; the run happens later.
// It NEVER auto-edits model-routing.json — it recommends; a human applies + reruns
// check-model-routing.js.
//
// Set shape (evals/parity/sets/<name>.json):
//   { "cheaperTier": "sonnet",
//     "agents": { "gate-checker": { "pairs": [ { "opus":"FAIL","cheap":"FAIL","severity":"blocker" }, ... ] } } }

import { readJson, cohenKappa, writeJson } from './lib/eval-lib.mjs'

const ADOPT_MIN = 0.8

export function parity(set) {
  const agents = {}
  for (const [agent, d] of Object.entries(set.agents ?? {})) {
    const pairs = d.pairs ?? []
    const opus = pairs.map((p) => p.opus)
    const cheap = pairs.map((p) => p.cheap)
    const k = cohenKappa(opus, cheap)
    const blockerDisagreements = pairs.filter(
      (p) => p.opus !== p.cheap && p.severity === 'blocker',
    ).length
    const adopt = !k.degenerate && k.kappa !== null && k.kappa >= ADOPT_MIN && blockerDisagreements === 0
    agents[agent] = {
      n: pairs.length,
      kappa: k.kappa,
      degenerate: k.degenerate,
      blockerDisagreements,
      decision: adopt ? 'adopt-cheaper' : 'keep-opus',
    }
  }
  return { cheaperTier: set.cheaperTier, adoptMin: ADOPT_MIN, generatedAt: set.generatedAt, agents }
}

// ── CLI: node evals/harness/parity.mjs <parity-set.json> ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const setPath = process.argv[2]
  if (!setPath) {
    console.error('usage: parity.mjs <parity-set.json>')
    process.exit(2)
  }
  const report = parity(readJson(setPath))
  writeJson(setPath.replace(/\.json$/, '.report.json'), report)
  console.log(`Enforcer parity — opus vs ${report.cheaperTier} (adopt if κ ≥ ${report.adoptMin}, 0 blocker disagreements)`)
  const adopt = []
  for (const [agent, r] of Object.entries(report.agents)) {
    const k = r.kappa == null ? 'n/a' : r.kappa.toFixed(2)
    console.log(`  ${agent}: κ=${k}, blocker-disagreements=${r.blockerDisagreements} → ${r.decision}`)
    if (r.decision === 'adopt-cheaper') adopt.push(agent)
  }
  if (adopt.length) {
    console.log(
      `\nRecommendation: move ${adopt.join(', ')} to "${report.cheaperTier}" in model-routing.json, then run ` +
        `node scripts/check-model-routing.js --write. (Not applied automatically.)`,
    )
  } else {
    console.log('\nRecommendation: keep all graders on opus.')
  }
}
