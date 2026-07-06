# PLANS.md — Execution Plan Format

## Roadmap → Specs (the altitude above plans)
/write-roadmap creates → docs/product-specs/ROADMAP.md (brief + backend openapi.json →
feature-area- and persona-ordered frontend specs, each gated on the backend spec it `Implements`).
The roadmap plans the SET of specs; /write-spec then authors each one. A large feature area may
span MULTIPLE plans — its spec's `**Plan:**` field then lists them all (e.g. PLAN-003, PLAN-007).

## Lifecycle
/write-plan creates → docs/exec-plans/active/PLAN-XXX.md [IN_PROGRESS]
  → layers built one by one, checkboxes ticked
  → /garbage-collect closes → docs/exec-plans/completed/ [COMPLETE]

Plans are NEVER deleted. They are the project memory.

## Pre-Build Requirement
Always run /api-sync before the first /build-layer to ensure the contract is current.

## Escalation Rule
Escalate to human only when judgment is required:
- Ambiguous acceptance criteria
- API contract has breaking changes requiring design decisions
- Performance budget impossible without architecture change
