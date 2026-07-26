---
id: LSN-0004
summary: "A check that resolves or tests nothing must fail loud — a false green is worse than a red."
status: ENFORCED
seen: 2
first_seen: PLAN-003
last_seen: PLAN-006
signatures: [assert:zero-tests, ac-vector:unresolved-spec]
enforced_by: "scripts/assert-tests-ran.mjs ; ac-vector exits non-zero on an unresolved active spec"
---
## What went wrong
Express jest ran **0 tests** and exited 0 in clean envs — every prior clean-env gate PASS was
partially vacuous (PLAN-003). `ac:vector` printed "no active plan/spec — nothing to grade" and
exited 0 when an active plan's spec id didn't resolve (DF-43). Both are green-looking exits that
verified nothing.

## Why it happens
"No work found" and "work passed" are different outcomes; a check that conflates them hides failure
behind a zero exit code.

## The rule
Assert the work actually happened — a nonzero test count, a resolvable spec. Absence of work is a
failure when work was expected, never a pass.
