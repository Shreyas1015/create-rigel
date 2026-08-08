// lib/candidates.mjs — PLAN-013 AC-3, the deterministic half of /backfill-knowledge.
//
// WHY THIS IS A COMMAND AND NOT SKILL PROSE. If the skill said "find the important domain types",
// the agent would grep and improvise, and a glossary full of plausible-but-wrong entries is exactly
// the wiki this system exists to not be. The precedent is `/curate`, which shells out to
// `curate-scan.mjs` — "read-only; prints a JSON plan, writes nothing". Same shape here.
//
// WHAT IT PROPOSES. Symbols that (a) are DEFINED by the same regex the anchor checker uses, so a
// proposed anchor is one that will actually resolve, and (b) are imported by the most other files,
// because fan-in is the closest mechanical proxy for "this term matters to the domain".
//
// WHAT IT REFUSES TO GUESS. The definition, the owner, the KPI. Those are asked of a human by the
// skill — see its Derive/Ask table. A machine-written definition just restates the code.
//
// Read-only. Always exits 0.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildGraph, reverseGraph, sourceFiles } from './impact.mjs'
import { listKnowledgeFiles, parseFrontmatter, KNOWLEDGE_DIR } from './knowledge.mjs'

// The SAME definition shapes the anchor checker resolves. Kept in lockstep deliberately: proposing
// an anchor this repo's own checker would reject is worse than proposing nothing.
const DEF_RE = /\b(?:class|interface|type|enum|struct|model)\s+([A-Z][A-Za-z0-9_]*)/g

const NOISE = new Set([
  'Props', 'State', 'Config', 'Options', 'Params', 'Args', 'Result', 'Response', 'Request',
  'Error', 'Context', 'Provider', 'Handler', 'Service', 'Controller', 'Repository', 'Module',
  // Framework and platform types. They have enormous fan-in and zero domain meaning, so ranking
  // by fan-in alone puts them on top — exactly the slop a glossary must not contain.
  'Express', 'Application', 'Router', 'Middleware', 'NextFunction', 'FastAPI', 'BaseModel',
])

// A domain term almost always lives in the layers that model the business; a type in utils/ or
// runtime/ is usually plumbing. Fan-in alone ranks plumbing highest (errors and framework types are
// imported everywhere), so weight by layer or the proposal is worse than useless.
const LAYER_WEIGHT = [
  [/^src\/(types|models|domain)\//, 3],
  [/^src\/services\//, 2],
  [/^src\/repo\//, 2],
  [/^src\/(utils|providers|runtime|config)\//, 0.4],
]
const weightOf = (p) => (LAYER_WEIGHT.find(([re]) => re.test(p)) ?? [null, 1])[1]

const isTest = (p) => /(^|\/)(tests?|__tests__|spec)\//.test(p) || /\.(test|spec)\.[a-z]+$/.test(p)

/** Terms already documented — never propose one twice. */
export function existingTerms(root) {
  const out = new Set()
  for (const rel of listKnowledgeFiles(join(root, KNOWLEDGE_DIR))) {
    if (!rel.startsWith('domain/glossary/')) continue
    try {
      const { data } = parseFrontmatter(readFileSync(join(root, KNOWLEDGE_DIR, rel), 'utf8'))
      if (data.term) out.add(String(data.term))
    } catch {
      /* an unreadable entry is not a reason to re-propose its term */
    }
  }
  return out
}

/**
 * @returns [{ symbol, file, fanIn }] — highest fan-in first, capped.
 */
export function candidates(root, { limit = 10 } = {}) {
  const files = sourceFiles(root).filter((p) => !isTest(p))
  const rev = reverseGraph(buildGraph(root))
  const already = existingTerms(root)

  const found = new Map() // symbol -> { file, fanIn }
  for (const rel of files) {
    let text
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue
    }
    const fanIn = (rev[rel] ?? []).length
    for (const m of text.matchAll(DEF_RE)) {
      const symbol = m[1]
      if (already.has(symbol) || NOISE.has(symbol) || symbol.length < 3) continue
      // Keep the definition site with the widest reach — that's the one worth anchoring.
      const score = (fanIn + 1) * weightOf(rel)
      const prev = found.get(symbol)
      if (!prev || score > prev.score) found.set(symbol, { file: rel, fanIn, score })
    }
  }

  return [...found.entries()]
    .map(([symbol, v]) => ({ symbol, file: v.file, fanIn: v.fanIn, score: Number(v.score.toFixed(2)) }))
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
    .slice(0, limit)
}
