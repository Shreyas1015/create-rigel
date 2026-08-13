// lib/decisions.mjs — PLAN-023 AC-4/AC-5. Which decisions a spec OWES, derived from the spec.
//
// This is what makes the design stage a gate rather than a template. The spec already declares its
// endpoints and entities; from those you can mechanically derive which decisions cannot be skipped.
// "You shipped an endpoint without deciding its authorization model" is a real defect and a
// derivable one — same move as `impact:` (declare intent, the gate verifies) and `/grill` (mark the
// guess, resolve it before it locks).
//
// FIVE TRIGGERS, NOT EIGHT. Consistency, partitioning and SLOs are held back deliberately. This
// fires on every spec, and an over-eager checklist is the cry-wolf failure that gets a gate switched
// off — taking the working gates with it. Five that always matter beats eight that half-matter.
//
// TRIGGERS ARE CATEGORIES, NOT ITEMS. Ten endpoints owe ONE authorization decision, not ten. The
// triggering items are listed on the decision so it is clear what it covers, but the count a team
// sees stays proportional to the spec: a read-only spec owes 2 decisions, a full CRUD spec owes 5.

const METHOD_RE = /\b(GET|POST|PUT|PATCH|DELETE)\b\s+(\/\S*)/i

/** Endpoints declared in the spec's "API Endpoints" section. */
export function parseEndpoints(md) {
  const sec = sectionOf(md, 'API Endpoints')
  if (!sec) return []
  const out = []
  for (const line of sec.split('\n')) {
    const m = METHOD_RE.exec(line)
    if (m) out.push({ method: m[1].toUpperCase(), path: m[2], label: `${m[1].toUpperCase()} ${m[2]}` })
  }
  return out
}

/** Entities declared in the spec's "Core Entities" table. */
export function parseEntities(md) {
  const sec = sectionOf(md, 'Core Entities')
  if (!sec) return []
  const out = []
  for (const line of sec.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const cells = t.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 2) continue
    if (/^-+$/.test(cells[0].replace(/[:\s]/g, ''))) continue
    if (/^entity$/i.test(cells[0])) continue
    if (/^\{.*\}$/.test(cells[0])) continue // the unfilled template row
    out.push({ name: cells[0], purpose: cells[1] })
  }
  return out
}

function sectionOf(md, heading) {
  const m = new RegExp(`^#{1,4}\\s+${heading}\\s*$`, 'im').exec(md)
  if (!m) return null
  const rest = md.slice(m.index + m[0].length)
  const next = /^#{1,4}\s+\S/m.exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

/**
 * The five triggers. Each returns the items that fired it, or [] when it does not apply.
 * `ref` names the bundled note that covers the decision — a starting point, not a required citation.
 */
export const TRIGGERS = [
  {
    id: 'authorization',
    title: 'authentication and authorization model',
    ref: 'authorization.md',
    why: 'who may do this, to whose records — guessing it produces a security bug that passes every test you wrote, because you wrote the tests from the same assumption',
    fires: ({ endpoints }) => endpoints.map((e) => e.label),
  },
  {
    id: 'idempotency',
    title: 'idempotency on retry',
    ref: 'idempotency.md',
    why: 'networks, clients and load balancers all retry; a non-GET endpoint with no dedupe strategy will see duplicates',
    fires: ({ endpoints }) => endpoints.filter((e) => e.method !== 'GET').map((e) => e.label),
  },
  {
    id: 'failure-handling',
    title: 'timeout, retry and failure behaviour',
    ref: 'failure-handling.md',
    why: 'a write path that does not say what happens when a dependency is slow has decided by omission: it will hang',
    fires: ({ endpoints }) => endpoints.filter((e) => e.method !== 'GET').map((e) => e.label),
  },
  {
    id: 'data-retention',
    title: 'retention and deletion',
    ref: 'data-retention.md',
    why: 'with no stated policy the answer is "forever", which is a growing cost and a growing liability',
    fires: ({ entities }) => entities.map((e) => e.name),
  },
  {
    id: 'rate-limiting',
    title: 'rate limiting / abuse posture',
    ref: 'rate-limiting.md',
    why: 'every public endpoint is called at whatever rate a client feels like, including a client with a bug',
    fires: ({ endpoints }) => endpoints.map((e) => e.label),
  },
]

/** What this spec owes. */
export function requiredDecisions(specMd) {
  const ctx = { endpoints: parseEndpoints(specMd), entities: parseEntities(specMd) }
  const out = []
  for (const t of TRIGGERS) {
    const items = t.fires(ctx)
    if (items.length) out.push({ id: t.id, title: t.title, ref: t.ref, why: t.why, triggeredBy: items })
  }
  return out
}

/**
 * Check a design document against what the spec owes.
 *
 * @param decisions  parsed design entries: {id, covers, decision, because, rejected[], standard, status}
 * @param required   from requiredDecisions()
 * @param resolveRef (ref) => {ok, reason?, suggestion?} — omit to skip citation checking entirely,
 *                   which is what happens when no corpus is configured. Skipping is REPORTED by the
 *                   caller, never silently treated as a pass.
 */
export function checkDesign({ decisions, required, resolveRef = null }) {
  const problems = []
  const covered = new Set()
  for (const d of decisions) for (const c of d.covers ?? []) covered.add(c)

  // 1. coverage — the derived part, and the reason this is a gate
  for (const r of required) {
    if (covered.has(r.id)) continue
    problems.push({
      kind: 'coverage',
      id: r.id,
      message: `no decision covers "${r.id}" (${r.title})`,
      detail: `triggered by: ${r.triggeredBy.slice(0, 4).join(', ')}${r.triggeredBy.length > 4 ? ` (+${r.triggeredBy.length - 4})` : ''}\n      ${r.why}`,
    })
  }

  for (const d of decisions) {
    const at = d.id ?? '(unnumbered)'
    if (!d.decision || !String(d.decision).trim()) {
      problems.push({ kind: 'empty', id: at, message: `${at} has no decision` })
    }
    // 2. rejected alternatives — the cheapest real quality signal here. A decision with nothing
    // rejected is a default that nobody chose, and it reads identically to one that was considered.
    if (!Array.isArray(d.rejected) || d.rejected.filter((x) => String(x ?? '').trim()).length === 0) {
      problems.push({
        kind: 'rejected',
        id: at,
        message: `${at} lists no rejected alternatives`,
        detail: `a decision with nothing rejected is a default nobody chose — name at least one option you turned down, and why`,
      })
    }
    // `observed` is the brownfield escape hatch and it is deliberately cheap: you may not know WHY
    // the code does this. You must still say what it does and what the alternatives were.
    if (d.status && !['decided', 'observed'].includes(d.status)) {
      problems.push({ kind: 'status', id: at, message: `${at} has status "${d.status}" — expected decided or observed` })
    }
    if (d.status !== 'observed' && (!d.because || !String(d.because).trim())) {
      problems.push({ kind: 'because', id: at, message: `${at} has no rationale (because:)` })
    }
    // 3. citations, when a corpus is configured
    if (resolveRef && d.standard) {
      const r = resolveRef(d.standard)
      if (!r.ok) {
        problems.push({
          kind: 'standard',
          id: at,
          message: `${at} cites "${d.standard}" — ${r.reason}`,
          detail: r.suggestion ? `did you mean: ${r.suggestion}` : `search the corpus with the design-notes MCP server`,
        })
      }
    }
  }

  const observed = decisions.filter((d) => d.status === 'observed').length
  return {
    ok: problems.length === 0,
    problems,
    covered: [...covered],
    required: required.map((r) => r.id),
    observed,
    decided: decisions.length - observed,
  }
}

// ── the design file ──────────────────────────────────────────────────────────────
// A deliberately small YAML subset: a list of decisions, scalar fields, and two list fields. The
// templates carry no YAML dependency and adding one to parse a file this shape would be absurd.
//
// IT IS STRICT ON PURPOSE. A lenient parser that skipped a line it did not understand would drop a
// `rejected:` block and report the decision as fine — a false pass, from the one component whose
// whole job is refusing them. Anything unrecognised is an error naming the line.
const SCALARS = ['id', 'decision', 'because', 'standard', 'status']
const LISTS = ['covers', 'rejected', 'triggered_by']

const unquote = (v) => {
  const t = v.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}
const inlineList = (v) =>
  v.trim().replace(/^\[|\]$/g, '').split(',').map((x) => unquote(x)).filter(Boolean)

/** @returns {{decisions: object[], errors: string[]}} */
export function parseDesign(text) {
  const decisions = []
  const errors = []
  let cur = null
  let listKey = null
  const lines = text.split('\n')

  const push = () => {
    if (cur) decisions.push(cur)
    cur = null
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\t/g, '  ')
    const line = raw.replace(/\s+$/, '')
    const n = i + 1
    if (!line.trim() || /^\s*#/.test(line)) continue

    // a new decision: "- id: DD-1" or "- key: value"
    const start = /^-\s+(\w+):\s*(.*)$/.exec(line)
    if (start && !/^\s/.test(line)) {
      push()
      cur = {}
      listKey = null
      assign(cur, start[1], start[2], n, errors)
      continue
    }
    // an item of the current list: "    - text"
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item) {
      if (!cur || !listKey) {
        errors.push(`line ${n}: list item outside a list — "${line.trim()}"`)
        continue
      }
      const v = unquote(item[1])
      if (v) cur[listKey].push(v)
      continue
    }
    // "  key: value"
    const kv = /^\s+(\w+):\s*(.*)$/.exec(line)
    if (kv) {
      if (!cur) {
        errors.push(`line ${n}: "${kv[1]}:" before any decision — the file must start with "- id: DD-1"`)
        continue
      }
      listKey = assign(cur, kv[1], kv[2], n, errors)
      continue
    }
    errors.push(`line ${n}: cannot parse "${line.trim()}"`)
  }
  push()
  return { decisions, errors }
}

function assign(obj, key, value, line, errors) {
  if (SCALARS.includes(key)) {
    obj[key] = unquote(value)
    return null
  }
  if (LISTS.includes(key)) {
    obj[key] = value.trim().startsWith('[') ? inlineList(value) : []
    return value.trim().startsWith('[') ? null : key // a block list continues on following lines
  }
  errors.push(`line ${line}: unknown field "${key}" — expected one of ${[...SCALARS, ...LISTS].join(', ')}`)
  return null
}
