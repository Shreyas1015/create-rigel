# PLAN-023 — The design stage: decisions that must be made, grounded in a reference corpus

**Target:** v0.26.0 (corpus + index + MCP) → v0.27.0 (`/write-design` + gate)
**Status:** DRAFT

---

## Context

The pipeline is roadmap → spec → plan → build. The spec says *what* and the plan says *in what
order*, but nothing records **which engineering decisions were made and why**. Datastore choice,
consistency model, caching strategy, idempotency, retry policy, authorization model, retention — all
of these get decided implicitly inside `/build-layer`, by whoever is writing that layer, with no
record and nothing to review.

That is the gap. A spec can pass every gate we have and still ship an endpoint whose authorization
model nobody ever chose.

Two things make this worth a phase rather than a template:

1. **What must be decided is derivable from the spec.** The spec already declares its entities,
   endpoints and NFRs. A spec with a `POST` endpoint owes an idempotency decision. One with an entity
   holding user data owes a retention decision. That makes coverage *mechanical*, which is the
   difference between a checklist and a gate.
2. **A decision without a cited reference is an opinion.** Rigel already has the machine for this:
   knowledge anchors must mechanically resolve or the build fails. The same mechanism applied to
   design decisions turns "we chose write-through" into a claim traceable to a documented tradeoff.

---

## Decisions taken

1. **No PRD.** The spec already carries Problem Statement, What We're Building, Business Rules,
   NFRs, Out of Scope and Acceptance Criteria. A second requirements document is a second place for
   requirements to disagree, and the spec is the one wired to acceptance tests.
2. **No separate LLD document.** `ARCHITECTURE.md` and the layer rules already encode LLD *and*
   already fail the build — layer boundaries, Zod at the edges, cursor pagination, no ORM in
   services. Prose beside a gate weakens the gate. Thin spots get new layer rules, not a new doc.
3. **One new stage: `/write-design`**, between `/write-spec` and `/write-plan`.
4. **The corpus is a plug, never a hardcode.** create-rigel ships the *mechanism* plus a
   vendor-neutral default. A personal reference library is a local corpus, resolved at runtime. No
   third party's content ever enters the package.
5. **Greenfield and brownfield use the same stage**, separated by one field: `status: decided` vs
   `status: observed`. Same doctrine as the manifest's `baseline` and the memory ladder's OBSERVED.

---

## AC-1 — Corpus resolution

Resolution order, first hit wins, evaluated per project:

| # | Source | Who it is for |
|---|---|---|
| 1 | `RIGEL_NOTES_PATH` env var → a directory of markdown | someone with their own reference library |
| 2 | `.rigel/design-refs.json` → `{ "corpus": "<path>" }` | a project pinning a specific library |
| 3 | bundled `reference/` shipped in the package | everyone else — zero setup |

**No corpus resolving is not an error.** `standard:` becomes optional and the other two gate checks
still apply. A gate that hard-fails because an optional reference library is absent would make the
feature a liability on any machine that has not opted in — including CI.

The bundled corpus is **original writing** covering the decision areas below, with citable headings:
authorization, idempotency, failure handling and retries, caching, consistency, data retention,
rate limiting, observability. Public standards are *cited* (OWASP ASVS, Google SRE Book, RFC 9110,
12-Factor, AWS Well-Architected) — never reproduced.

## AC-2 — `create-rigel design-index <path>`

Walks a markdown corpus and writes `.rigel/design-refs.json`: every file, every heading, slugged to
an anchor. Measured on a 358-file corpus: **278 KB, 7802 anchors**. Small enough to commit, which is
the point — citation checking is then offline, deterministic, and works on a machine that has never
seen the corpus.

Read-only apart from the one output file. Exits 0 with a count; exits 1 only if the path is unusable.

## AC-3 — The `rigel-design-notes` MCP server

Generic over any markdown corpus. Ships in the package and is auto-declared in every template's
`.mcp.json`, so it is configured on install with no user action. `mcp:check` already fails the gate
if a declared server cannot start, so this inherits that guarantee.

Tools:

| Tool | Returns |
|---|---|
| `list_topics()` | the corpus's top-level structure |
| `search_notes(query, limit)` | ranked headings + file paths + a short excerpt |
| `read_note(path, section?)` | one file, or one section of it |

Search is lexical over the index (title/heading weighted above body), not embeddings: it must run
offline, start instantly, and produce the same answer twice. A corpus of a few hundred files does
not need vectors, and a gate cannot depend on a model being available.

## AC-4 — `/write-design`, and what it must cover

Runs after `/write-spec`, before `/write-plan`. Produces
`docs/product-specs/design/SPEC-XXX.design.yml`.

**Coverage is derived from the spec**, so it cannot be quietly skipped:

| Spec contains | Decision required | Grounded in |
|---|---|---|
| any endpoint | authentication + authorization model | OWASP ASVS |
| a non-GET endpoint | idempotency on retry | RFC 9110 |
| an external call or write path | timeout, retry, backoff, failure mode | Google SRE |
| an entity holding user data | retention + PII handling | OWASP ASVS |
| any endpoint | rate limiting / abuse posture | OWASP ASVS |

**Five rules in the first cut, not eight.** An over-eager checklist is the cry-wolf failure that
gets a gate switched off, and this one fires on every spec. Consistency, partitioning and SLOs are
deliberately held back until the five have been lived with.

```yaml
- id: DD-3
  triggered_by: [POST /applications]
  decision: Idempotency-Key header, 24h dedupe window in Redis
  because: Mobile clients retry on flaky networks; duplicate applications are user-visible
  rejected:
    - Natural-key dedupe — candidates legitimately re-apply after rejection
    - No dedupe — accepted duplicates were the top support ticket last quarter
  standard: rfc-9110#idempotent-methods
  status: decided
```

## AC-5 — The gate

`scripts/check-design.mjs`, wired into the gate chain in all four templates:

1. **Coverage** — every trigger derived from the spec has a decision. Missing one → exit 1.
2. **`rejected:` is non-empty** — a decision with no alternative considered is a default nobody
   chose. The cheapest real quality signal here.
3. **`standard:` resolves** against the index when a corpus is present. Unknown anchor → exit 1.
   No corpus → skipped, and *reported as skipped* rather than silently passed.

## AC-6 — Brownfield is the same stage

`status: observed` records a decision the code already embodies that nobody has reviewed;
`because:` may be `unknown — inherited`. Coverage still applies, so an adopted repo gets a number —
*"11 of 14 required decisions are observed, not decided"* — that shrinks as work touches those
areas. `doctor` reports it in CONVERGENCE alongside the existing numbers. No second pipeline.

## AC-7 — Verify end to end (from a packed tarball)

1. Scaffold with **no corpus and no env var** → `mcp:check` passes, `check-design` reports the
   citation check as skipped, gate exits 0. *This is the case that must not regress.*
2. Scaffold, `design-index` a corpus, cite a real anchor → passes. Break the anchor → exit 1.
3. A spec with a `POST` endpoint and no idempotency decision → exit 1 naming the trigger.
4. A decision with empty `rejected:` → exit 1.
5. `RIGEL_NOTES_PATH` pointing at a local corpus overrides the bundled one; unset it and the
   bundled one is used again.
6. The MCP server starts and answers `list_topics` with no corpus configured.

---

## Out of scope

- **Embeddings / semantic search.** Lexical is deterministic and offline; a gate cannot depend on a
  model being reachable. Revisit only if lexical demonstrably fails on a real corpus.
- **Auto-generating decisions from code.** That is `spec-miner`'s hazard in another costume: a
  decision inferred from an implementation canonises whatever is there. `status: observed` records
  that honestly instead, and a human promotes it.
- **Consistency / partitioning / SLO triggers.** Held for a later cut — see AC-4.
- **Shipping any third-party reference content.** The corpus default is original writing that cites
  public standards.

## Sequence

`AC-1 → AC-2 → AC-3 → v0.26.0`, then `AC-4 → AC-5 → AC-6 → AC-7 → v0.27.0`. The corpus machinery
ships first because `/write-design` is worth little without something to cite, and the MCP server is
independently useful the day it lands.
