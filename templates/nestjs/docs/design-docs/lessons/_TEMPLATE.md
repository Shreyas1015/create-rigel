---
id: LSN-0000
summary: "One line, scanned at session start — what to avoid and why, in a breath"
status: OBSERVED # OBSERVED | INVESTIGATED | VERIFIED | DISTILLED | ENFORCED
seen: 1 # times this failure's signature has recurred (across plans)
first_seen: PLAN-XXX
last_seen: PLAN-XXX
signatures: [] # gate-failure signatures that map here — e.g. ["eslint:no-restricted-imports", "arch:paranoid-missing"]. /curate matches on these.
enforced_by: null # once ENFORCED: the mechanical check, e.g. "eslint:no-restricted-imports" or "post-write.sh:injectmodel-in-service". The prose below is then deleted.
---

<!--
This is the lesson template. Copy it to `LSN-XXXX-slug.md`, fill it in, delete this comment.
One lesson per file — greppable, diffable, reviewable in a PR. A bad lesson shows up as a red
line in a diff; that review is the containment. See docs/design-docs/memory.md for the loop.

`signatures` is the load-bearing field: it's how /curate knows this failure recurred. A
signature is `{gate}:{stable-discriminator}` and is stable ACROSS files (same class, different
location = same lesson). Add every signature this lesson covers.
-->

## What went wrong

<The concrete failure. One real instance is enough — cite the plan / DF-id it came from.>

## Why it happens

<Root cause, not a restatement of the symptom.>

## The rule

<The generalized rule. The test it must pass to earn a lesson file: **would this rule catch a
future, DIFFERENT instance** — a different file, feature, or template — not just re-describe
what already happened? If no, it's an instance, not a lesson; leave it in the findings log.>
