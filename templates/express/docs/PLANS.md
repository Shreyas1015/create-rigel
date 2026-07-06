# PLANS.md — Execution Plan Format & Lifecycle

---

## Roadmap → Specs (the altitude above plans)

`/write-roadmap` creates → `docs/product-specs/ROADMAP.md` (epics → dependency-ordered specs).
The roadmap plans the SET of specs for a whole product; `/write-spec` then authors each one.
A single spec may span MULTIPLE plans — slice a big spec into shippable milestones, each its own
`PLAN-XXX`. The spec's `**Plan:**` field then lists them all (e.g. `PLAN-003, PLAN-007`).

---

## Lifecycle

```
/write-plan creates → docs/exec-plans/active/PLAN-XXX.md  [IN_PROGRESS]
  → layers built one by one, checkboxes ticked
  → /garbage-collect closes → docs/exec-plans/completed/  [COMPLETE]
```

Plans are **never deleted.** They are the project's memory.

---

## Plan Template

```markdown
# PLAN-XXX — {Feature Name}

**Status:** IN_PROGRESS
**Spec:** docs/product-specs/ready/SPEC-XXX-{slug}.md
**Created:** YYYY-MM-DD
**Completed:** —

---

## Goal
One sentence.

---

## Layer Build Order

| # | Layer | Files | Gate Focuses On |
|---|---|---|---|
| 1 | Types | `src/types/...` | Zero imports, zero logic |
| 2 | Config | `src/config/...` | process.env only in env.ts |
| 3 | Models | `src/models/...` | paranoid, UUIDv7, indexes |
| 4 | Migrations | `db/migrations/...` | Runs clean, has down() |
| 5 | Repo | `src/repo/...` | Zod parse, cursor, ownership, no N+1 |
| 6 | Service | `src/services/...` | No express, ≥90% coverage |
| 7 | Runtime | `src/runtime/routes/v1/...` | Auth first, envelope |
| 8 | Workers | `src/runtime/workers/...` | Zod payload, retry, logs |
| 9 | Tests | `tests/...` | Coverage gates |

---

## Acceptance Criteria
- [ ] criterion (from spec)

---

## Progress Log

### YYYY-MM-DD — Plan created
- notes

---

## Decision Log

### Decision: {title}
**Date:** YYYY-MM-DD
**Context:** why this decision was needed
**Chosen:** what was decided
**Alternatives:** what else was considered
**Trade-offs:** what this costs
```

---

## Small Task Alternative (< 2 hours)

Use a PR description instead of a full plan:

```markdown
## What
[1-2 sentences]

## Why
[1 sentence]

## Checklist
- [ ] Types updated
- [ ] Tests pass
- [ ] ESLint clean
- [ ] QUALITY_SCORE.md updated
```

---

## Escalation Rule

Escalate to human only when judgment is required:
- Ambiguous acceptance criteria
- Conflicting requirements
- Security decision with no established pattern
- Performance budget impossible without architecture change

Never escalate for: technical unknowns, linter failures, test failures — fix those.
