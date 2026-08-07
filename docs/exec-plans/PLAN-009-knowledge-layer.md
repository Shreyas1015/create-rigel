# PLAN-009 — The company knowledge layer

**Status:** COMPLETE (v0.11.0)
**Target release:** v0.11.0
**Owner:** @Shreyas1015
**Depends on:** PLAN-008 — the manifest, `rigel update`, and the company-layer format are the
delivery mechanism for everything here.

---

## What this plan does, in plain words

An agent working in `acme-billing` currently knows nothing about `acme-orders`. It can't answer
*"what does this touch?"*, *"what does this word mean here?"*, or *"what part of the business is
this?"* without cloning half the company.

This plan makes the **facts** about every other service exist inside each repo. Not their code —
just enough to reason offline. That is what "company knowledge base" means here, and it's what
Rigel's cardinal rule (*"if it isn't in this repository, it doesn't exist"*) actually demands.

Three kinds of knowledge, each with a different rule:

| Kind | Example | How it's kept honest |
|---|---|---|
| **Business** | what the company sells, which capability this serves, its KPI | hand-written, small, rarely changes |
| **Domain** | what "Shipment" means and how it differs from "Order" | hand-written but **anchored** to real code — build fails if the anchor dies |
| **Map** | who provides what, who consumes what | **generated** from contracts — never hand-written |

The test for whether something belongs here: **can the agent derive it from the repo?** Folder
layouts and dependency lists — yes, so don't write them; they rot and are inert. Business purpose,
domain meaning, cross-repo edges — no, so they must be written or they're lost.

---

## Structure

```
acme-rigel/knowledge/
  business/
    company.md                ← what the company does, who pays, what "good" means
    capabilities/
      checkout.md             ← owner, KPI, revenue link, which services implement it
      fulfilment.md
  domain/
    glossary.md               ← domain vocabulary, anchored to real code
    contexts/
      billing.md              ← what billing owns, its invariants, its boundaries
      identity.md
  map/
    services.json             ← GENERATED index: every service's provides / consumes / deps
    capabilities.json         ← GENERATED: capability → services
```

### What each repo receives

| Content | Distributed | Why |
|---|---|---|
| `business/company.md` | **whole** | Small; every agent needs to know what the company does |
| `business/capabilities/*` | **whole** | Needed to state impact; each file is short |
| `domain/glossary.md` | **whole** | Shared vocabulary is the entire point of a glossary |
| `domain/contexts/<own>.md` | **own only** | A service needs its own context in full; others' internals are noise |
| `map/*.json` | **whole** | This is what makes cross-repo reasoning possible offline |

---

## Acceptance Criteria

### AC-1 — Knowledge structure + distribution rules
The `knowledge/` tree above, defined in the company-layer format, with the distribution rules
(whole glossary + capabilities + business + map; **own context doc only**) applied by both scaffold
and `rigel update`. `knowledge/**` is a `managed` path, so it is kept in sync and tamper-checked by
`rigel verify`.

Templates ship an **empty but valid** `knowledge/` skeleton with a README explaining what belongs
there — a consumer's knowledge is about their own product, not something Rigel can author.

### AC-2 — Anchoring + `rigel knowledge:verify`
Every domain entry points at something real:

```markdown
---
term: Shipment
anchors:
  - path: src/models/Shipment.model.ts
  - symbol: Shipment
---
A **Shipment** is a physical movement of goods. It is NOT an Order (the commercial
agreement). One Shipment may fulfil many Orders. Cancelling an Order does **not**
cancel its Shipment — that caused INC-2024-11.
```

`rigel knowledge:verify` resolves every anchor against the repo and reports unresolved ones. A wiki
rots in silence; **anchored knowledge rots loudly**. This is what earns prose a place under the
cardinal rule — it can fail a build.

Ships **advisory for one release**, then blocking. A new gate that misfires once teaches everyone to
ignore it.

### AC-3 — The generated map (facts up, index down)
```
each service repo ──(publishes .rigel/service.json)──▶ layer ──(aggregates)──▶ map/services.json
                                                                                     │
                every service repo ◀────── rigel update distributes it ──────────────┘
```

- **Facts up:** each repo emits `.rigel/service.json` derived from its OpenAPI export (provides), its
  vendored contracts / generated clients (consumes), and its env schema + compose file (infra deps).
  Generated, never hand-written.
- **Aggregate:** the layer merges them into `map/services.json` and `map/capabilities.json`, each
  carrying a `GENERATED — do not edit` header and gated by regenerate-and-diff.
- **Index down:** `rigel update` distributes the merged map to every repo.
- **Query helper:** `rigel map <service>` prints only the relevant slice.

**The map is data queried by a script, never a document loaded into context.** At 50 services a
prose listing would consume the context window every session for nothing.

Nothing here is hand-maintained: hand-written dependency lists are always wrong (Roadie customers
plateau at 88–90% catalog completeness after months of funded effort).

### AC-4 — Verify end-to-end
- Scaffold from a company layer → knowledge distributed per the rules: whole glossary present, whole
  capabilities present, **only the service's own context doc**, map present.
- Rename a file an anchor points at → `knowledge:verify` reports it (advisory), and fails once flipped.
- Add a new service to the layer → the regenerated map includes it; a stale committed map fails the
  regenerate-diff gate.
- Hand-edit a distributed knowledge file → `rigel verify` fails (it's a `managed` path).
- `rigel map <service>` prints a correct, minimal slice for a repo that has never cloned that service.

---

## Progress log
- [x] AC-1 knowledge structure + distribution rules + empty skeleton in templates
- [x] AC-2 anchoring format + `rigel-knowledge` (advisory this release, blocking next)
- [x] AC-3 generated map: facts up, aggregate, index down, query helper
- [x] AC-4 end-to-end verification

---

## Deferred — decide separately

- **Blast radius.** AC-3 exists to make it possible: the map is deliberately data-plus-query rather
  than prose, which is exactly what a real blast-radius computation needs. But *what* it computes,
  *whether* it blocks a spec, and *how* it presents deserve their own decision and their own plan.
  Do not bolt it on here.
- **Business impact modelling.** Capability files carry stated KPI/revenue facts, and a spec can be
  required to state expected impact. Rigel does not and will not *predict* revenue — it forces the
  question and supplies the frame.
- **Service catalog / `catalog-info.yaml`.** If ever, generated only. And **no OTel cross-check**:
  the service-graph connector is alpha with a 2s span TTL and warns *"spans are not paired up
  reliably"*; nobody ships it as enforcement, not even Datadog. A gate that cries wolf would
  compromise trust in Rigel's other gates — the actual asset.

---

## Decision log
- **Knowledge is a local index of the company, not documentation.** The test is whether the agent can
  derive it from the repo. Derivable → don't write it. Not derivable → it must be written or it's lost.
- **Prose is allowed, but must be anchored.** Unanchored prose rots silently; anchored prose fails a
  build.
- **Whole glossary, own context only.** Shared vocabulary is the point of a glossary; other services'
  internals are context bloat.
- **The map is generated, never hand-written**, and queried by a script rather than loaded wholesale.
- **The map's honesty depends on spec freshness.** A service that hand-writes routes bypassing its
  OpenAPI export is invisible to the map. The spec-freshness gate (PLAN-010) is what closes this;
  note the dependency rather than pretending the map is complete without it.
