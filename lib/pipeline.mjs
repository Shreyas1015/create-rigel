// lib/pipeline.mjs — PLAN-024 AC-1. The pipeline a scaffolded repo actually has, read from its skills.
//
// The post-scaffold message used to be a typed string: `/write-roadmap → /write-spec → /write-plan →
// /build-layer`. /write-design shipped in v0.27.0 and the string never learned about it, so the first
// thing a new user read described a pipeline that no longer existed. Deriving it from the numbered
// skill directories means it can only be wrong if the skills are.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Ordered pipeline commands for a repo: the numbered skills after 00 (setup) up to and including
 * build-layer. Stopping at build-layer is what makes this stack-agnostic — nestjs numbers one lower
 * than the others, so no fixed range would be right for both.
 */
export function pipeline(repoRoot) {
  const dir = join(repoRoot, '.claude', 'skills')
  if (!existsSync(dir)) return []
  const out = []
  for (const d of readdirSync(dir).filter((n) => /^\d{2}-/.test(n)).sort()) {
    if (d.startsWith('00-')) continue
    out.push('/' + d.replace(/^\d{2}-/, ''))
    if (d.endsWith('build-layer')) break
  }
  return out
}

/** `/grill` is a step inside /write-spec, not a skill of its own — name it where it runs. */
export function pipelineLine(repoRoot) {
  return pipeline(repoRoot)
    .map((c) => (c === '/write-spec' ? '/write-spec (+ /grill)' : c))
    .join(' → ')
}
