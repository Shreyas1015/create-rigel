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

**Hard rule: write nothing outside `docs/design-docs/lessons/`.** Read the loop in
`docs/design-docs/memory.md` first.

---

## Step 1 — Read the failure record

```bash
test -s .rigel/gate-failures.jsonl || { echo "No gate failures recorded — nothing to curate."; exit 0; }
cat .rigel/gate-failures.jsonl        # one JSON object per line: {ts, plan, signature, message, file, line}
ls docs/design-docs/lessons/*.md 2>/dev/null   # existing lessons (each has a `signatures:` list)
```

## Step 2 — Group by signature

Group the failure lines by their `signature` field (`{gate}:{discriminator}`, e.g.
`arch:paranoid-missing`). A signature is **stable across files** — the same class of
failure in three different files is ONE group with three occurrences, not three lessons.

## Step 3 — Match each signature group against existing lessons

For each signature group, find the lesson whose `signatures:` list contains that signature:

- **Exactly one match** → that's the lesson. Increment its `seen` (by the number of *distinct
  plans* the signature recurred in, not raw line count), set `last_seen` to the newest plan.
- **No match** → create a new lesson from `lessons/_TEMPLATE.md`: next `LSN-` id, `status: OBSERVED`,
  `seen: 1`, `first_seen`/`last_seen` = the plan(s), `signatures: [<the signature>]`, and fill
  "What went wrong" from the failure `message`/`file`. Leave "Why"/"The rule" as honest stubs —
  do NOT invent a root cause you didn't verify.
- **More than one candidate** (only happens for a *coarse* signature like a bare `tsc:TS2345`
  that several lessons claim) → run ONE short "same root cause?" check: compare the failure
  `message` against each candidate's `summary`, pick the one that matches, else create a new
  lesson. This LLM step fires ONLY here — never as the default path.

## Step 4 — Flag promotion-ready (do not promote)

After updating, list any lesson that is **`seen >= 3` AND `status: DISTILLED`** as
**promotion-ready**. Promotion is a human step (see `/garbage-collect` report + `memory.md`): a
person writes the ESLint rule / `post-write.sh` grep / gate step, sets `status: ENFORCED`, and
deletes the prose body. `/curate` never promotes and never edits `status` above `OBSERVED` on its
own — climbing the ladder (INVESTIGATED → VERIFIED → DISTILLED) is a human judgment recorded in
the lesson file.

## Step 5 — Clear the consumed record

```bash
# The failures are now reflected in lessons/. Truncate so the next feature starts clean.
: > .rigel/gate-failures.jsonl
```

## Step 6 — Report

```
Curated N failure signature(s):
  +K new OBSERVED lessons: [LSN-…]
  ↑M lessons incremented:  [LSN-… seen=x]
  ⚑ promotion-ready:        [LSN-… (seen>=3, DISTILLED)]  → hand to a human to enforce
```
