# PLANS.md — Execution Plan Format

## Roadmap → Specs (the altitude above plans)
/write-roadmap creates → docs/product-specs/ROADMAP.md (epics → dependency-ordered specs).
The roadmap plans the SET of specs for a whole product; /write-spec then authors each one.
A single spec may span MULTIPLE plans — slice a big spec into shippable milestones, each its own
PLAN-XXX. The spec's `**Plan:**` field then lists them all (e.g. `PLAN-003, PLAN-007`).

## Lifecycle
/write-plan creates → docs/exec-plans/active/PLAN-XXX.md [IN_PROGRESS]
  → layers built one by one, checkboxes ticked
  → /garbage-collect closes → docs/exec-plans/completed/ [COMPLETE]

Plans are NEVER deleted. They are the project memory.

## Plan Template
See any file in docs/exec-plans/ for the full template.

## Escalation Rule
Escalate to human only when judgment is required:
- Ambiguous acceptance criteria
- Conflicting requirements  
- Security decision with no established pattern
- Performance budget impossible without architecture change

Never escalate for: linter failures, test failures, technical unknowns — fix those.
