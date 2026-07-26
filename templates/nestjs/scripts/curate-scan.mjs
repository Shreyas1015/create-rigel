#!/usr/bin/env node
// scripts/curate-scan.mjs — the DETERMINISTIC core of /curate (read-only planner).
//
// Grouping and counting must not be an LLM's job — it miscounts. This reads the recorded
// failures + the existing lessons' `signatures` and emits a PLAN of what /curate should do.
// The /curate skill applies the plan (writing new-lesson bodies / disambiguating coarse
// signatures is the only judgment left to the model). Writes nothing.
//
// Usage: node scripts/curate-scan.mjs   →   prints a JSON plan:
//   { create: [{signature, plans, seen, message, file}],
//     increment: [{id, signature, seen, plans, lastSeen}],
//     disambiguate: [{signature, plans, candidates:[id,...]}],
//     promotionReady: [{id, seen, status}] }         // seen>=3 AND status DISTILLED
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const FAILURES = '.rigel/gate-failures.jsonl'
const LESSONS = 'docs/design-docs/lessons'

function readFailures() {
  if (!existsSync(FAILURES)) return []
  return readFileSync(FAILURES, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

// tiny frontmatter reader — only the fields we need, one value per line
function readLessons() {
  if (!existsSync(LESSONS)) return []
  const out = []
  for (const f of readdirSync(LESSONS).filter((f) => f.startsWith('LSN-') && f.endsWith('.md'))) {
    const txt = readFileSync(join(LESSONS, f), 'utf8')
    const fm = txt.split('---')[1] || ''
    const get = (k) => (fm.match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim()
    const sigRaw = get('signatures') || '[]'
    const signatures = sigRaw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
    out.push({ file: f, id: get('id'), status: get('status'), seen: Number(get('seen') || 0), signatures })
  }
  return out
}

export function scan(failures, lessons) {
  const bySig = new Map() // signature -> Set(plans)
  const sample = new Map() // signature -> {message,file} (first occurrence)
  for (const r of failures) {
    if (!bySig.has(r.signature)) {
      bySig.set(r.signature, new Set())
      sample.set(r.signature, { message: r.message, file: r.file })
    }
    if (r.plan) bySig.get(r.signature).add(r.plan)
  }

  const plan = { create: [], increment: [], disambiguate: [], promotionReady: [] }
  for (const [signature, plansSet] of bySig) {
    const plans = [...plansSet].sort()
    const occ = Math.max(plansSet.size, 1) // distinct plans; a same-plan repeat still counts once
    const matches = lessons.filter((l) => l.signatures.includes(signature))
    if (matches.length === 0) {
      plan.create.push({ signature, plans, seen: occ, ...sample.get(signature) })
    } else if (matches.length === 1) {
      const l = matches[0]
      const newSeen = l.seen + occ
      plan.increment.push({ id: l.id, signature, seen: newSeen, plans, lastSeen: plans[plans.length - 1] })
      if (newSeen >= 3 && l.status === 'DISTILLED') plan.promotionReady.push({ id: l.id, seen: newSeen, status: l.status })
    } else {
      plan.disambiguate.push({ signature, plans, candidates: matches.map((m) => m.id) })
    }
  }
  // lessons already at seen>=3 + DISTILLED (independent of this run) are promotion-ready too
  for (const l of lessons) {
    if (l.seen >= 3 && l.status === 'DISTILLED' && !plan.promotionReady.some((p) => p.id === l.id)) {
      plan.promotionReady.push({ id: l.id, seen: l.seen, status: l.status })
    }
  }
  return plan
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = scan(readFailures(), readLessons())
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n')
}
