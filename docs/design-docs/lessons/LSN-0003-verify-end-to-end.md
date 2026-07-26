---
id: LSN-0003
summary: "Verify end-to-end — a real scaffold-and-run is the release gate; component checks miss integration-only bugs."
status: DISTILLED
seen: 3
first_seen: PLAN-003
last_seen: PLAN-006
signatures: []
enforced_by: null
---
## What went wrong
Three integration-only bugs escaped component verification: express jest silently ran 0 tests
(PLAN-003); style-dictionary v5 built fine while the plan assumed v4 was required (PLAN-005);
run-trial's budget billed 44M cache-read tokens and falsely ERRORED a green build (PLAN-006/RT-1).
Each passed its component checks; only a real run exposed it. 3-for-3.

## Why it happens
Component verification proves each part in isolation. Integration-only failures live in the seams
between parts and in the real toolchain's actual behavior — invisible until you run the whole thing.

## The rule
Component verification is necessary and insufficient. The release gate is a real scaffold-and-run,
every time. See [[verify-end-to-end-not-just-components]].
