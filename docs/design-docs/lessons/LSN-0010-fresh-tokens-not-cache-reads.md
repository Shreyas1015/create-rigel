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
## What went wrong
`run-trial.mjs` summed `cache_read_input_tokens` into its token budget. A normal multi-turn build
reads tens of millions of *cached* tokens, so a green G1 build billed 44.26M and was falsely marked
ERRORED at a 6M budget (RT-1) — caught only by a real headless trial, not unit tests.

## Why it happens
Cache reads scale with context × turns and are cheap; counting them makes every real build look
like a runaway. They measure re-reading, not work.

## The rule
When metering LLM usage for a budget, count fresh tokens (input + output + cache_creation) and
record cache reads separately. A regression test replays the 44M scenario.
