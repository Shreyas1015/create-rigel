# Memory — how this project learns

This project keeps a **memory of its own failures** and turns the recurring ones into checks
that make them impossible. It is small on purpose. **Memory here is a staging area for gate
rules, not a library of prose.** A lesson that matters graduates into a mechanical check and
its prose is then deleted; a lesson that doesn't recur, or turns out wrong, is deleted too.

- One lesson per file: `docs/design-docs/lessons/LSN-XXXX-*.md` (schema: `lessons/_TEMPLATE.md`).
- Greppable, diffable, reviewable in a PR. A bad lesson is a red line in a diff.
- Session start reads `lessons/` (the frontmatter `summary` is what's scanned; bodies on demand).

**Two files, two lifetimes — don't confuse them:**

| file | holds | lifetime |
|---|---|---|
| `docs/design-docs/lessons/*.md` | what we learned | **durable** — committed, reviewed, permanent |
| `STATE.md` | where the last session stopped, open failures | **ephemeral** — git-ignored, overwrite freely |
| `.rigel/gate-failures.jsonl` | raw gate FAILs awaiting curation | **transient** — cleared by `/curate` |

If `STATE.md` ever disagrees with the active plan, **the plan wins**. It's a hint, not a record.

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
4. Flags **stale candidates** — lessons still `OBSERVED` that haven't recurred in 5+ plans. They
   were one-offs, not classes. A human deletes them; nothing auto-deletes. (Un-deleted stale prose
   is how a lessons directory becomes noise nobody trusts.)
5. Pushes `DISTILLED`/`ENFORCED` lessons into the `## Known failure modes` section of the one skill
   that owns that layer — so a lesson reaches the agent **at the point of work**, not only at
   session start. Never `OBSERVED` ones: unverified content must not reach the harness's own
   instructions.

## When the same failure repeats mid-build — `/debug`

`/curate` is end-of-feature bookkeeping. **`/debug` is what runs during the build**: when a layer
fails the gate twice with the *same signature*, `/build-layer` hands off to it rather than guessing
again. It forces a falsifiable hypothesis, a minimal reproduction, gate-verified confirmation, and
an honest stop after three falsified hypotheses.

That's the enforceable spine of **"the fix is never 'try harder'"** — and it feeds this loop, since
every repeat it resolves is already recorded as a signature for `/curate` to count.

## How a lesson dies — promotion to enforcement

A `promotion-ready` lesson is promoted by a **human**, who:

1. Writes the actual check — a ruff rule, a `grep` in `.claude/hooks/post-write.sh`, or a gate
   step — so the failure can never reach a commit again.
2. **Runs the promotion gate** (below). It fails closed.
3. Sets `status: ENFORCED`, fills `enforced_by` with the check's id, and **deletes the prose
   body** (the frontmatter + `signatures` stay as the pointer; the enforcement carries the "why"
   in a one-line comment referencing the `LSN-` id).

### The promotion gate — a rule must earn its place

```bash
python3 scripts/verify_promotion.py LSN-XXXX                     # checks the rule doesn't break the build
python3 scripts/verify_promotion.py LSN-XXXX --tamper-verified   # after proving it catches the failure
```

A promoted rule must satisfy **both** halves, or it isn't promoted:

1. **It must not break the working build** — run the gate; a rule that rejects correct code is worse
   than no rule, because false positives train everyone to ignore it. *(mechanical)*
2. **It must actually catch the failure** — plant a violation, confirm the check blocks it, revert.
   *(attested, because how you plant a violation differs per rule)*

Without `--tamper-verified` the gate **exits non-zero**. Unverifiable enforcement is decorative
enforcement, and this fails closed rather than rubber-stamping it.

> The roadmap's stronger rule — *"no lesson promotes unless the golden-set score goes up"* — needs
> accumulated golden-trial data. Until that exists, the two checks above are the honest local
> equivalent: same discipline (does it help? does it work?), available today. When golden trials
> run, add the score delta as a third check.

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

**Worktree isolation for subagents is also deliberately absent.** It prevents parallel maker and
verifier agents from colliding on the same files — but this harness runs subagents **sequentially**
(`/build-layer` calls the gate-checker one at a time; there is no concurrent maker/verifier). It
would be machinery for a collision that cannot currently occur. Add it the day the loop actually
runs agents in parallel, not before.

Add machinery when something actually breaks — a real bad-actor, a repo whose lesson count makes
grep slow, parallel agents, or manual promotion becoming a bottleneck. Not before.
