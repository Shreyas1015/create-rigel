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
//     promotionReady: [{id, seen, status}],          // seen>=3 AND status DISTILLED
//     staleCandidates: [{id, lastSeen, plansSince, status}] }  // OBSERVED and long-untouched
//
// Stale = still OBSERVED (never climbed the ladder) and not seen for STALE_AFTER plans: it was a
// one-off, not a class. Reported as a CANDIDATE only — a human deletes it. Un-deleted stale prose
// is the documented rot mode of lesson systems; nothing here auto-deletes.
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
    out.push({
      file: f,
      id: get('id'),
      status: get('status'),
      seen: Number(get('seen') || 0),
      lastSeen: get('last_seen') || null,
      promoteBy: get('promote_by') || null,
      signatures,
    })
  }
  return out
}

const STALE_AFTER = 5 // plans an OBSERVED lesson may go untouched before it's a delete candidate
const planNum = (p) => {
  const m = /PLAN-(\d+)/.exec(p || '')
  return m ? Number(m[1]) : null
}

/** Current plan number: the active plan, else the newest plan mentioned anywhere. */
function currentPlan(failures, lessons) {
  if (existsSync('docs/exec-plans/active')) {
    for (const f of readdirSync('docs/exec-plans/active')) {
      const n = planNum(f)
      if (n) return n
    }
  }
  const seen = [...failures.map((f) => planNum(f.plan)), ...lessons.map((l) => planNum(l.lastSeen))].filter(Boolean)
  return seen.length ? Math.max(...seen) : null
}

export function scan(failures, lessons, nowPlan = null) {
  const bySig = new Map() // signature -> Set(plans)
  const sample = new Map() // signature -> {message,file} (first occurrence)
  for (const r of failures) {
    if (!bySig.has(r.signature)) {
      bySig.set(r.signature, new Set())
      sample.set(r.signature, { message: r.message, file: r.file })
    }
    if (r.plan) bySig.get(r.signature).add(r.plan)
  }

  const plan = { create: [], increment: [], disambiguate: [], promotionReady: [], staleCandidates: [], overdue: [] }
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

  // overdue: a /postmortem lesson whose promote_by date has passed. A deadline nobody surfaces is
  // a deadline nobody meets — this is what makes the postmortem's promise real.
  const today = new Date().toISOString().slice(0, 10)
  for (const l of lessons) {
    if (l.status === 'ENFORCED' || !l.promoteBy) continue
    if (l.promoteBy < today) plan.overdue.push({ id: l.id, promoteBy: l.promoteBy, status: l.status })
  }

  // stale: still OBSERVED and untouched for STALE_AFTER plans → a one-off, not a class.
  // Never flagged if it recurred in THIS run (it just got incremented).
  if (nowPlan) {
    const touched = new Set(plan.increment.map((i) => i.id))
    for (const l of lessons) {
      if (l.status !== 'OBSERVED' || touched.has(l.id)) continue
      const last = planNum(l.lastSeen)
      if (last === null) continue
      const since = nowPlan - last
      if (since >= STALE_AFTER) {
        plan.staleCandidates.push({ id: l.id, lastSeen: l.lastSeen, plansSince: since, status: l.status })
      }
    }
  }
  return plan
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = readFailures()
  const lessons = readLessons()
  const plan = scan(failures, lessons, currentPlan(failures, lessons))
  process.stdout.write(JSON.stringify(plan, null, 2) + '\n')
}
