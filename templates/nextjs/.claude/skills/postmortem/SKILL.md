---
name: postmortem
description: /postmortem — turn an incident into a rule that makes it impossible
verified: 2026-08-07
libraries: []
source: docs/design-docs/memory.md
note: Process skill. A /curate variant — writes ONE lesson at INVESTIGATED with a promotion deadline.
---

# /postmortem — the deliverable is a merged check, not a document

Triggered by: `/postmortem "<what happened>"` after something broke in production.

**This is not an ops ritual.** No severity matrix, no on-call rota, no timeline template — none of
that fails a build, so none of it belongs here. The documented failure of postmortems is *follow
through*, not analysis: no owner, tracked in the doc rather than a tracker, language too vague to
verify as done. So this produces exactly one thing — **a lesson on the ladder with a deadline** —
and the ladder already ends in enforcement.

You are writing the answer to one question: **what check would have caught this?**

---

## Step 1 — Establish what actually happened

Facts only, from the incident itself. If you are inferring, say so.

- What broke, observably? (the error, the symptom users saw)
- What change introduced it, and when did it land?
- Why did the gate let it through? **This is the important one** — the gate is the thing that was
  supposed to stop it, so its silence is the real finding.

If the gate *did* fire and was overridden, that is a different lesson: the escape hatch is too easy.
Say that instead.

## Step 2 — Write the lesson at `INVESTIGATED`

Create `docs/design-docs/lessons/LSN-XXXX-{slug}.md` from `lessons/_TEMPLATE.md`, with:

```markdown
---
id: LSN-XXXX
summary: "One line: the class of failure, not this instance."
status: INVESTIGATED
seen: 1
first_seen: INC-<date or id>
last_seen: INC-<date or id>
signatures: []
enforced_by: null
promote_by: 2026-09-15        # REQUIRED — a date, not "soon"
---
## What went wrong
<the incident, concretely — one paragraph>

## Why it happens
<root cause. If you don't know it yet, say "unknown" — do not invent one.>

## The rule
<the generalised rule>

## What check would have caught this
<REQUIRED. Be specific enough to build: an eslint rule on X, a grep in post-write.sh for Y,
a gate step asserting Z, an arch test that fails when W. "More testing" is not an answer.>
```

Two fields are non-negotiable:

- **"What check would have caught this"** — if you cannot name one, you have not finished the
  analysis. Write "none — this is only preventable by review" **explicitly** if that is genuinely
  true, so the claim is visible and arguable rather than a silent gap.
- **`promote_by`** — a date. A postmortem without a deadline is a document, which is what we are
  trying not to produce.

`status: INVESTIGATED`, not `VERIFIED` — the fix has not been proven by the gate yet. It climbs when
the gate confirms it, exactly like any other lesson.

## Step 3 — Report, and hand over the promotion command

```
Incident recorded: LSN-XXXX — <summary>
  status:      INVESTIGATED
  promote by:  <date>
  the check:   <the named check>

Next: build that check, then
  node scripts/verify-promotion.mjs LSN-XXXX --tamper-verified
which requires that it (1) doesn't break the build and (2) actually catches a planted violation.
Then set status: ENFORCED and delete the prose body.
```

---

## What this skill must NOT do

- **Do not write a fix.** A postmortem records; the fix is ordinary work on a branch with a plan.
- **Do not touch anything outside `docs/design-docs/lessons/`.**
- **Do not promote.** Promotion is a human step behind `verify-promotion`, deliberately.
- **Do not open a second lesson** for a failure that matches an existing one's class — increment
  that lesson's `seen` instead. Recurrence is the signal that earns enforcement; splitting it into
  two lessons hides exactly the evidence you need.

## Known failure modes

- **Writing the instance, not the class.** "The billing worker crashed on 2026-08-07" is an
  incident. "A worker without a Zod payload guard crashes on malformed input" is a lesson. Only the
  second can catch the *next* one.
- **A deadline nobody looks at.** `promote_by` is only worth having if something surfaces it —
  `/curate` reports overdue lessons at each `/garbage-collect`.
