---
id: LSN-0007
summary: "A gate that fires when an artifact exists must be scheduled at the layer that creates the artifact, not later."
status: DISTILLED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: [arch:isolation-test-missing]
enforced_by: null
---
## What went wrong
The cross-user isolation arch gate fails the moment an owner-scoped repo exists (the Repo layer),
but the plan template and build-layer scheduled the isolation test under the *Tests* layer — so the
Repo-layer gate failed until the test was added early (DF-34).

## Why it happens
An existence-triggered gate and the plan's build order disagreed about *when* the artifact is due.
The gate wins; the schedule was wrong.

## The rule
Schedule an artifact's required tests/docs at the layer that first makes the gate fire, not at a
tidy later "tests" phase. Read the gate to find when the obligation begins.
