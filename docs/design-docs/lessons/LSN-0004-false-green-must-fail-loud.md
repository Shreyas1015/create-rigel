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
