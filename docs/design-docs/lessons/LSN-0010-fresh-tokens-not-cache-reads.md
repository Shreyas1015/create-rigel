---
id: LSN-0010
summary: "Budget on FRESH LLM tokens (input+output+cache_creation); cache reads accumulate per turn and aren't spend."
status: ENFORCED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: "evals/harness/run-trial.test.mjs (44M-cache-read regression guard)"
---
