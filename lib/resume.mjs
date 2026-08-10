// lib/resume.mjs — PLAN-018. "Where was I" as a derived fact, not a remembered one.
//
// STATE.md is the resume pointer today, and it has two holes. It is **hand-written**, so it is
// accurate only if the last session remembered to update it; and it is **git-ignored**, so a fresh
// clone — a new machine, a colleague, CI — starts with nothing at all. Reading it is also prose
// guidance in CLAUDE.md, which means it is followed most of the time rather than always.
//
// Everything below is derived from artifacts that are already committed:
//
//   the plan's own checkboxes   docs/exec-plans/active/*.md   ← /build-layer ticks these
//   git                         branch, uncommitted files
//   recorded gate failures      .rigel/gate-failures.jsonl
//
// So it cannot drift from reality and cannot be forgotten. `/build-layer` already ticks `- [ ]` →
// `- [x]` when a layer's gate passes, which makes the plan file the one place progress is recorded
// mechanically. Reading it back is just using a fact the project already maintains.
//
// (Prior art: ECC's SessionStart/Stop hooks. Theirs also *mines the session transcript* for
// extractable patterns. That half is deliberately not copied — see `/curate`, which derives lessons
// from RECORDED FAILURES rather than inferring them from a conversation, and makes them climb
// OBSERVED → ENFORCED before anything treats them as fact. A transcript-mined "pattern" written
// straight into the knowledge base is an assertion nobody verified.)
//
// THIS MODULE WRITES NOTHING. A session-start side effect is the kind of surprise that gets a hook
// deleted, and every input here is already on disk.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `trim` is opt-OUT, and that matters: `git status --porcelain` emits a fixed-width two-column
 * status followed by a space, so a modified-unstaged file is " M path". Trimming that strips the
 * leading space and shifts the path by one — and only on the FIRST line, since every later line
 * keeps its space after the newline. It reads as a one-off typo rather than a parse bug, which is
 * exactly why it survived until a real repo printed `ib/update.mjs`.
 */
const git = (root, args, { trim = true } = {}) => {
  try {
    const out = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return trim ? out.trim() : out
  } catch {
    return '' // not a repo, or git absent — every caller treats '' as "unknown", never as "clean"
  }
}

/** The active plan and how far through its layers we are. */
export function activePlan(root) {
  const dir = join(root, 'docs/exec-plans/active')
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
  if (!files.length) return null

  const file = files[0]
  const text = readFileSync(join(dir, file), 'utf8')
  const layers = []
  for (const m of text.matchAll(/^\s*-\s*\[([ xX])\]\s*(Layer\s+\d+[^\n]*)/gm)) {
    layers.push({ done: m[1] !== ' ', label: m[2].trim() })
  }
  const next = layers.find((l) => !l.done) ?? null
  return {
    file: `docs/exec-plans/active/${file}`,
    id: (file.match(/PLAN-\d+/) ?? [])[0] ?? null,
    layers,
    done: layers.filter((l) => l.done).length,
    total: layers.length,
    next: next?.label ?? null,
    extra: files.length - 1, // more than one active plan is itself worth reporting
  }
}

/** Branch, uncommitted files, last commit subject. */
export function gitState(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!branch) return null
  const dirty = git(root, ['status', '--porcelain'], { trim: false })
    .split('\n')
    .filter((l) => l.length > 3)
    // "XY path" — and for a rename, "R  old -> new"; report where the file is NOW.
    .map((l) => l.slice(3).replace(/^.* -> /, ''))
  return { branch, dirty, last: git(root, ['log', '-1', '--format=%h %s']) }
}

/**
 * Gate failures grouped by signature.
 *
 * Reported as **recurring**, never as "open". Nothing in the log records a fix, so claiming a
 * failure is still unresolved would be an inference the data does not support — and a resume block
 * that overstates is worse than one that says less.
 */
export function recurringFailures(root, { top = 4 } = {}) {
  const p = join(root, '.rigel/gate-failures.jsonl')
  if (!existsSync(p)) return []
  const by = new Map()
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r
    try {
      r = JSON.parse(line)
    } catch {
      continue // one corrupt line must not blank the whole resume block
    }
    if (!r?.signature) continue
    const e = by.get(r.signature) ?? { signature: r.signature, count: 0, plans: new Set(), last: null }
    e.count++
    if (r.plan) e.plans.add(r.plan)
    e.last = r.message ?? e.last
    by.set(r.signature, e)
  }
  return [...by.values()]
    .map((e) => ({ ...e, plans: e.plans.size }))
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .slice(0, top)
}

/**
 * The block injected at session start. Short on purpose: it is prepended to every session, so
 * length here is a tax on every future turn.
 */
export function resumeBlock(root) {
  const plan = activePlan(root)
  const g = gitState(root)
  const fails = recurringFailures(root)
  const L = []

  if (plan) {
    const bar = plan.total ? ` — ${plan.done}/${plan.total} layers done` : ''
    L.push(`Active plan: ${plan.id ?? plan.file}${bar}`)
    if (plan.next) L.push(`  next: ${plan.next}`)
    else if (plan.total) L.push(`  all layers ticked — this plan is ready to close (/garbage-collect)`)
    if (plan.extra > 0) L.push(`  note: ${plan.extra + 1} plans in active/ — only the first is summarised`)
  } else {
    L.push(`Active plan: none in docs/exec-plans/active/`)
  }

  if (g) {
    L.push(`Branch: ${g.branch}${g.dirty.length ? ` — ${g.dirty.length} uncommitted file(s)` : ' — clean'}`)
    if (g.dirty.length) L.push(`  ${g.dirty.slice(0, 5).join(', ')}${g.dirty.length > 5 ? ` (+${g.dirty.length - 5})` : ''}`)
    if (g.last) L.push(`  last commit: ${g.last}`)
  }

  if (fails.length) {
    L.push(`Recurring gate failures (recorded, not necessarily still open):`)
    for (const f of fails) L.push(`  ${f.signature} ×${f.count}${f.plans > 1 ? ` across ${f.plans} plans` : ''}`)
    L.push(`  → /curate turns a repeat offender into a lesson`)
  }

  if (!L.length) return ''
  return ['<session-resume derived-by="rigel">', ...L.map((l) => '  ' + l),
    '  (derived from the plan checkboxes, git, and recorded failures — STATE.md holds the prose)',
    '</session-resume>'].join('\n')
}
