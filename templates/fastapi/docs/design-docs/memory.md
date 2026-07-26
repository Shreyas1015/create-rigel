# Memory — how this project learns

This project keeps a **memory of its own failures** and turns the recurring ones into checks
that make them impossible. It is small on purpose. **Memory here is a staging area for gate
rules, not a library of prose.** A lesson that matters graduates into a mechanical check and
its prose is then deleted; a lesson that doesn't recur, or turns out wrong, is deleted too.

- One lesson per file: `docs/design-docs/lessons/LSN-XXXX-*.md` (schema: `lessons/_TEMPLATE.md`).
- Greppable, diffable, reviewable in a PR. A bad lesson is a red line in a diff.
- Session start reads `lessons/` (the frontmatter `summary` is what's scanned; bodies on demand).

## The lifecycle — a lesson climbs, then dies into a rule

Promotion is gated on **epistemic status, not just an occurrence count** — a coincidence that
happened three times is still a coincidence.

| status         | meaning                                                          |
| -------------- | ---------------------------------------------------------------- |
| `OBSERVED`     | it happened once; logged with its failure `signatures`           |
| `INVESTIGATED` | root cause hypothesised                                          |
| `VERIFIED`     | the gate confirmed the fix works                                 |
| `DISTILLED`    | generalised into a rule that applies beyond this one instance    |
| `ENFORCED`     | promoted to a mechanical check; the prose lesson body is deleted |

**Rigel's structural advantage:** most systems pay an unreliable LLM to guess what broke. This
project's deterministic gate already says exactly what broke and where (`file:line`), so the
`VERIFIED` stage is free — the gate re-run is the proof.

## How a lesson is born and counted — `/curate`

`/curate` runs inside `/garbage-collect` (end of feature) and **writes nothing outside
`lessons/`**:

1. Reads `.rigel/gate-failures.jsonl` — every gate FAIL this project has recorded, each with a
   **signature** `{gate}:{discriminator}` (e.g. `ruff:F401`, `mypy:arg-type`,
   `arch:isolation-test-missing`). Signatures are stable across files, so the same class of
   failure in a different file counts as the same lesson.
2. Groups failures by signature and matches each against existing lessons' `signatures`:
   - **match** → increment `seen`, update `last_seen`.
   - **no match** → create a new `OBSERVED` lesson carrying that signature.
   - A *coarse* signature (e.g. a bare `mypy:arg-type`) that maps to more than one candidate lesson
     is disambiguated by a short "same root cause?" check against those candidates only — never
     the default, only when the deterministic key can't decide.
3. Flags any lesson at `seen >= 3` **and** `status: DISTILLED` as **promotion-ready**.

## How a lesson dies — promotion to enforcement (manual in v1)

A `promotion-ready` lesson is promoted by a **human**, who:

1. Writes the actual check — a ruff rule, a `grep` in `.claude/hooks/post-write.sh`, or a gate
   step — so the failure can never reach a commit again.
2. Sets `status: ENFORCED`, fills `enforced_by` with the check's id, and **deletes the prose
   body** (the frontmatter + `signatures` stay as the pointer; the enforcement carries the "why"
   in a one-line comment referencing the `LSN-` id).

**No automated promotion in v1.** A golden eval set exists to answer "does this rule help?", but
until it's been run against real trial data a human is the gate. Automate later only if manual
promotion becomes a real bottleneck.

## Seeding lessons is judgment, not a batch job

When converting a backlog of findings into lessons, go **class by class**, not one-per-finding.
Most findings are *instances*; only the ones that generalise become lessons. Apply the test in
`_TEMPLATE.md` ("would this rule catch a future, different instance?") and **group related
findings into one lesson**. A rushed conversion poisons the well on day one.

## Scope — why this stays minimal (and why that holds for teams, too)

This design intentionally omits trust ledgers, provenance signing, poisoning containment, a
Generator/Reflector/Curator agent split, vector search, and automated promotion. That is not
because the users are solo — **teams use this, and the memory ships into their repos.** It's
because, even for a team:

- **Containment already exists:** one lesson per file + PR review means a bad lesson is caught
  the same way any bad change is — a red line a reviewer rejects. No ledger needed for
  contributors you can already review.
- **Poisoning/provenance matters only when you *ingest* lessons from outside the repo** — a
  shared company knowledge base, a community catalog. That's a distribution concern for later,
  not a same-repo one.
- **Grep beats embeddings** at tens-to-low-hundreds of lessons: faster, debuggable, zero-dep.
- **Automated promotion needs a validated eval gate in the loop.** The gate exists; it hasn't
  been proven on real data yet, so the human stays the gate.

Add machinery when something actually breaks — a real bad-actor, a repo whose lesson count makes
grep slow, or manual promotion becoming a bottleneck. Not before.
