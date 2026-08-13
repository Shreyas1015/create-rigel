---
name: 03-write-design
description: /write-design — Record the engineering decisions this spec owes
verified: 2026-08-13
libraries: []
source: docs/exec-plans/PLAN-023-design-stage.md
note: Process skill — no library dependencies, no freshness check needed.
---

# /write-design — Record the decisions this spec owes

Triggered by: `/write-design`. Runs **after** `/write-spec`, **before** `/write-plan`.

---

## Why this exists

The spec says *what* to build. The plan says *in what order*. Neither records **which engineering
decisions were made, or why**.

So they get made anyway — inside `/build-layer`, by whoever happens to write that layer, with no
record and nothing to review. A spec can pass every other gate in this repo and still ship an
endpoint whose authorization model nobody chose.

This is not a document describing the system. It is a short list of decisions, each of which must
name what it turned down.

## Step 1 — Find out what the spec owes

```bash
npm run design:check
```

With no design file yet it prints exactly which decisions this spec triggers and why. **The list is
derived from the spec itself** — its endpoints and entities — so it is not a matter of taste:

| The spec has | It owes |
|---|---|
| any endpoint | authentication + authorization model |
| a non-GET endpoint | idempotency on retry |
| a non-GET endpoint | timeout, retry and failure behaviour |
| a persisted entity | retention and deletion |
| any endpoint | rate limiting / abuse posture |

Triggers are **categories, not items**: ten endpoints owe *one* authorization decision, not ten. A
read-only spec owes two decisions. A full CRUD spec owes five. That is the whole list.

## Step 2 — Ground each decision before making it

The `design-notes` MCP server is configured in this repo. Use it — that is what it is for:

```
search_notes("idempotency")          → citable refs like idempotency.md#deciding-the-window
read_note("idempotency.md", "deciding-the-window")
```

The shipped corpus covers exactly these five decisions and cites the standard settling each (OWASP
ASVS, Google SRE Book, RFC 9110, AWS Well-Architected). If the team has pointed `RIGEL_NOTES_PATH`
at their own notes, you will get those instead — search first, then decide.

**Read before you decide.** A decision written from memory is the thing this step exists to replace.

## Step 3 — Write `docs/product-specs/design/SPEC-XXX.design.yml`

```yaml
- id: DD-1
  covers: [authorization]
  triggered_by: [POST /applications, GET /applications/:id]
  decision: Owner-only reads; admins may read any. Enforced in the repo layer, not the route.
  because: Applications hold personal data, and a second caller (the worker) reaches the same repo
  rejected:
    - Route-level checks only — the worker bypasses them entirely
    - Any authenticated user — leaks candidate data across tenants
  standard: authorization.md#where-the-check-belongs
  status: decided

- id: DD-2
  covers: [idempotency, failure-handling]
  triggered_by: [POST /applications]
  decision: Idempotency-Key header, 24h dedupe window in Redis; 3 retries with jittered backoff
  because: Mobile clients retry on flaky networks and duplicate applications are user-visible
  rejected:
    - Natural-key dedupe — candidates legitimately re-apply after a rejection
    - No dedupe — duplicate applications were the top support ticket last quarter
  standard: idempotency.md#deciding-the-window
  status: decided
```

Fields: `id` · `covers` (which triggers this answers) · `triggered_by` (what fired them) ·
`decision` · `because` · `rejected` · `standard` (optional citation) · `status`.

### `rejected:` is not paperwork

A decision with nothing rejected is a **default that nobody chose**, and on the page it reads
exactly like one that was considered carefully. Naming the option you turned down, and why, is the
cheapest real quality signal available here — and it is the field a reviewer actually reads.

If you genuinely cannot name an alternative, that is a sign you have not made a decision yet.

### Existing code: `status: observed`

When the code already does this and nobody has reviewed it, say so:

```yaml
- id: DD-4
  covers: [rate-limiting]
  decision: No rate limiting on any route
  because: unknown — inherited
  rejected:
    - Per-user token bucket — not implemented; would need shared state
  status: observed
```

`observed` needs no rationale, because you may not know why. It still needs alternatives, so the gap
is visible. The gate counts these and reports *"N of M decisions are observed, not decided"* — a
number that shrinks as feature work touches those areas. This is how an existing repo joins the
process without a migration project.

## Step 4 — Prove it

```bash
npm run design:check
```

It refuses while any required decision is missing, any decision names no rejected alternative, or
any citation does not resolve. It is a gate step, so `npm run gate` runs it too.

If no reference corpus is configured, citations are **not checked**, and it says so rather than
passing quietly.

## Step 5 — Tell the human

```
Design decisions: docs/product-specs/design/SPEC-XXX.design.yml   (N decisions, all required covered)

Review the `rejected:` lines first — that is where a decision either holds up or falls over.
Then run /write-plan.
```
