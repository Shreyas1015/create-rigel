---
name: curate
description: /curate — turn recorded gate failures into lessons (runs inside /garbage-collect)
verified: 2026-07-24
libraries: []
source: docs/design-docs/memory.md
note: Process skill — reads .rigel/gate-failures.jsonl, writes ONLY under docs/design-docs/lessons/.
---

# /curate — Grow the lesson memory from real gate failures

Triggered by: `/curate` (also run automatically as a step in `/garbage-collect`).

The deterministic gate already says exactly what broke and where — so unlike systems that pay an
LLM to guess, the `VERIFIED` stage here is free. Your job is bookkeeping, not diagnosis: group
recorded failures by their **signature** and fold them into the lesson files.

**Write scope (hard rule).** You may write ONLY:
1. files under `docs/design-docs/lessons/`, and
2. a single one-line entry under a skill's `## Known failure modes` heading — **only** for a lesson
   that is already `DISTILLED` or `ENFORCED` (Step 5).

**Never** touch source code, tests, gates, or any other part of a skill. Read the loop in
`docs/design-docs/memory.md` first.

---

## Step 1 — Read the failure record

```bash
test -s .rigel/gate-failures.jsonl || { echo "No gate failures recorded — nothing to curate."; exit 0; }
cat .rigel/gate-failures.jsonl        # one JSON object per line: {ts, plan, signature, message, file, line}
ls docs/design-docs/lessons/*.md 2>/dev/null   # existing lessons (each has a `signatures:` list)
```

## Step 2 — Run the deterministic scan (grouping + counting is NOT your job)

```bash
node scripts/curate-scan.mjs      # read-only; prints a JSON plan, writes nothing
```

Grouping by signature and counting recurrence is done by the script, not by you — an LLM
miscounts. The plan has four lists: `create`, `increment`, `disambiguate`, `promotionReady`.
Signatures are **stable across files**, so the same class of failure in three files is one group
with three occurrences, not three lessons.

## Step 3 — Apply the plan (the only judgment left to you)

- **`increment`** → for each, bump that lesson's `seen` to the given value and set `last_seen`.
  Mechanical; just edit the frontmatter.
- **`create`** → for each, create a lesson from `lessons/_TEMPLATE.md`: next `LSN-` id,
  `status: OBSERVED`, the given `seen`/`plans`, `signatures: [<the signature>]`, and fill "What
  went wrong" from the failure `message`/`file`. Leave "Why"/"The rule" as honest stubs — do NOT
  invent a root cause you didn't verify.
- **`disambiguate`** → the ONLY judgment step (a coarse signature like a bare `tsc:TS2345` that
  several lessons claim). Compare the failure `message` against each candidate's `summary`; bump
  the one that matches, else `create` a new lesson. This is the only place the model decides.

## Step 4 — Flag promotion-ready (do not promote)

The scan's `promotionReady` list is any lesson at **`seen >= 3` AND `status: DISTILLED`**.
Surface it. Promotion is a human step (see `/garbage-collect` report + `memory.md`): a
person writes the ESLint rule / `post-write.sh` grep / gate step, sets `status: ENFORCED`, and
deletes the prose body. `/curate` never promotes and never edits `status` above `OBSERVED` on its
own — climbing the ladder (INVESTIGATED → VERIFIED → DISTILLED) is a human judgment recorded in
the lesson file.

## Step 5 — Surface stale lessons (report; never auto-delete)

The scan's `staleCandidates` are lessons still `OBSERVED` that haven't recurred for 5+ plans —
they were one-offs, not classes. **Report them for a human to delete.** Do not delete them
yourself: deletion is cheap to do and expensive to get wrong, and it belongs in a reviewed diff.

Un-deleted stale prose is how these systems rot — a lessons directory nobody trusts because half of
it is noise. Surfacing candidates every cycle is what keeps it honest.

## Step 6 — Push distilled lessons into the skill that owns them

A lesson only helps if it reaches the agent **at the point of work**, not just at session start.
For each lesson that is `DISTILLED` or `ENFORCED` and not already referenced, append ONE line under
the `## Known failure modes` heading of the single skill that owns that layer (create the heading at
the end of the skill if absent):

```markdown
## Known failure modes
- LSN-0031: Every @Table needs paranoid: true — soft delete, not hard delete.
```

Rules: one line per lesson, its `summary` verbatim, one skill only (the one whose layer the failure
belongs to), never for an `OBSERVED` lesson (unverified content must not reach the harness's own
instructions), and never rewrite anything already in the skill.

## Step 7 — Clear the consumed record

```bash
# The failures are now reflected in lessons/. Truncate so the next feature starts clean.
: > .rigel/gate-failures.jsonl
```

## Step 8 — Report

```
Curated N failure signature(s):
  +K new OBSERVED lessons: [LSN-…]
  ↑M lessons incremented:  [LSN-… seen=x]
  ⚑ promotion-ready:        [LSN-… (seen>=3, DISTILLED)]  → hand to a human to enforce
  ⌫ stale candidates:       [LSN-… (OBSERVED, N plans cold)] → human deletes
  ↳ skills updated:         [04-build-layer ← LSN-…]
```
