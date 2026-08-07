# PLAN-011 — Blast radius

**Status:** DRAFT — for review
**Target release:** v0.14.0
**Owner:** @Shreyas1015

---

## What you asked for, and what the evidence says

> *"each of them is a module, all APIs are there — whenever we make a feature spec it should check
> if anything breaks. And if we deliberately want to break it, we should have the permission on
> what behaviour it should."*

That's three separate problems. Two are buildable now. One needs reframing.

| Your ask | Verdict |
|---|---|
| "what else in this repo does this touch" | **Buildable — as a REPORT, never a block** |
| "the spec should check what breaks" | **Reframe: the spec DECLARES, the gate VERIFIES the declaration** |
| "permission to deliberately break it" | **Buildable — reuse the expiry-waiver pattern already shipped** |

### Why the report can't be a gate

This is the one finding that decides the whole design. Impact analysis is **deliberately
conservative** — it flags what *might* be affected, so it over-reports by construction. And static
graphs are blind in exactly the places that hurt: *"static call graphs lie — they can't reveal the
message queue that pages teams at 2 AM or the feature flag that reroutes traffic."*

High false-positive rates cause alert fatigue; teams then disable the blocking behaviour. Rigel has
already refused one gate for this reason (the OTel service-graph cross-check). **A blast-radius gate
that cries wolf would cost us the gates that actually work — which are the asset.**

So: blast radius **informs**. The **blocking** already exists and is exact — `oasdiff` on the
contract. We don't need a second, fuzzier gate; we need the fuzzy thing to be *visible* and the
exact thing to be *enforced*.

### Why "the spec checks what breaks" needs reframing

At spec time the code doesn't exist yet, so nothing can be *computed*. But something better is
available: the author **declares intent**, and a later gate — where the diff is real — checks
whether reality matched. That's the changesets model (declare the impact, CI enforces the
consequence), and it's mechanical rather than predictive.

**One sentence:** *the spec doesn't predict what breaks — it declares what you intend to break, and
the contract gate proves you were honest.*

### The established prior art we're copying

Reverse-dependency queries over a build graph: Bazel's `rdeps(//..., //target)` — *"what else
depends on this package"* — and Nx's affected. Both are **file/target-level**, not symbol-level,
and both are used to *scope work*, not to block merges. That's the shape to copy.

---

## Acceptance Criteria

### AC-1 — `rigel impact` (the report; never blocks)
```
rigel impact [--paths <a,b>] [--symbol <Name>] [--json]
```
Answers *"if I change this, what else is involved?"* by joining three things Rigel already has:

| Layer | Source | Already shipped? |
|---|---|---|
| In-repo files that import it | `madge` / `dependency-cruiser` reverse edges | madge yes |
| Services that consume my API | `knowledge/map/services.json` → `consumedBy` | **yes** |
| Business stake | `knowledge/business/capabilities/*` → owner, KPI | **yes** |
| Tests that cover it | `jest --findRelatedTests` / `pytest-testmon` | no |

Defaults to the working-tree diff, so `rigel impact` with no args answers *"what does my current
change touch?"*. **Exit code is always 0.** It is a lens, not a gate.

Output names its own blind spots — queues, feature flags, string-keyed routing, DI containers, ORM
magic, reflection. A report that implies completeness is worse than one that admits its edges.

### AC-2 — Declared impact in the spec
`/write-spec` gains one required block:

```yaml
impact:
  touches: [Order, orders-api]      # entities/APIs this feature changes
  breaking: false                   # do you intend to break a consumer?
  consumers_notified: []            # required only when breaking: true
```

`/write-spec` runs `rigel impact` first and shows the author what the map says, so the declaration
is *informed* rather than guessed. But the field is the author's claim — the tool never fills it in
silently, because a machine-written declaration verifies nothing.

A spec with no `impact` block does not pass `/write-plan`. Declaring is cheap; the cost is only in
being wrong, which AC-3 catches.

### AC-3 — The gate verifies the declaration (this is the blocking part)
At gate time, where the diff is real, the **existing** contract gate compares reality to the claim:

| Declared | Reality (oasdiff) | Result |
|---|---|---|
| `breaking: false` | no break | ✅ pass |
| `breaking: true` | breaking | ✅ pass — it was authorized (AC-4) |
| **`breaking: false`** | **breaking** | ❌ **FAIL — an undeclared break** |
| `breaking: true` | no break | ✅ pass, noted — over-declaring is safe |

This is the whole point and it costs almost nothing: `oasdiff` already computes the right-hand
column. We're only adding "did you say so?".

Asymmetric on purpose: over-declaring is free, under-declaring fails. That's the direction that
keeps people honest without punishing caution.

### AC-4 — Authorization for a deliberate break
**No new mechanism.** Reuse the expiring-exemption pattern already shipped three times (`x-sunset`,
`.oasdiff-ignore`, manifest waivers). A declared break requires an entry carrying:

```
<the oasdiff error text>   # reason: <why>  # owner: @who  # expires: YYYY-MM-DD
                           # consumers: acme-web, acme-orders
```

- **`owner`** — a person, not a team. Diffuse ownership is how exemptions rot.
- **`expires`** — an expired entry **fails the build**, so a "temporary" break can't become permanent.
- **`consumers`** — must match what the map says is affected. Naming them is the "permission"
  step: you cannot break something without writing down who you're breaking it for.

**Never a PR label.** A skipped required check is a silently disabled gate, and the exemption
evaporates on merge leaving nothing in the repo.

### AC-5 — Verify end-to-end
- `rigel impact` on a changed file lists in-repo importers + `consumedBy` services + the capability.
- A spec without an `impact` block is refused by `/write-plan`.
- Remove a required response property with `breaking: false` → **gate fails: undeclared break**.
- Flip to `breaking: true` + an exemption naming the affected consumers → passes.
- Set the exemption's `expires` in the past → fails again.
- `rigel impact` exits 0 even when it reports a large radius (it is never a gate).

---

## Progress log
- [ ] AC-1 `rigel impact` report (in-repo + cross-service + capability + blind-spot disclosure)
- [ ] AC-2 declared `impact` block in `/write-spec`, required by `/write-plan`
- [ ] AC-3 declaration-vs-reality check wired into the existing contract gate
- [ ] AC-4 break authorization via the existing expiry-exemption pattern
- [ ] AC-5 end-to-end verification

---

## Explicitly out of scope
- **Symbol-level reference graphs as a gate.** File-level is what Bazel/Nx use and it's what survives.
  Symbol-level precision is a research problem; shipping it as a blocker would be the cry-wolf failure.
- **Consumer *consent* before a break lands.** In a polyrepo with no broker there is no mechanism to
  make another repo acknowledge anything at merge time — every cross-repo trigger is fire-and-forget.
  We can require you to *name* the consumers (AC-4); we cannot make them agree. Say so plainly.
- **Predicting impact from natural-language spec text.** Requirements-to-code traceability has a long
  history of overclaiming. The declaration is the author's, informed by the map.
- **Queue/event blast radius.** Same reason the async contract gate was refused: there is no reliable
  payload-level diff. A documented non-goal.
- **A transitive closure of the whole graph.** Depth-limited and reported; it explodes otherwise.

---

## Decision log
- **The report never blocks; the contract gate blocks.** Impact analysis is conservative by design,
  so it over-reports; false positives cause teams to disable gates, which would cost us the gates
  that work. Exactness lives in `oasdiff`; the map provides context.
- **Declared, not predicted.** At spec time the code doesn't exist. The changesets model — author
  declares, CI enforces — is mechanical where prediction is not.
- **Asymmetric verification.** Over-declaring passes; under-declaring fails. Caution is free.
- **Authorization reuses the fourth-time pattern** rather than inventing a fourth mechanism:
  reason + owner + expiry, and an expired exemption fails.
- **Naming affected consumers is the permission step.** It is the strongest thing achievable without
  a broker, and it converts "I broke it" into "I broke it for these people, and here's the date".
