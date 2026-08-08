---
id: LSN-0015
summary: "A CI file that re-lists a gate's steps always drifts from it. Invoke the gate, don't copy it — and never let a comment satisfy the check that proves you did."
status: ENFORCED
seen: 2
first_seen: PLAN-013
last_seen: PLAN-013
signatures: []
enforced_by: "scripts/check-ci-mirrors-gate.mjs — every shipped ci.yml must INVOKE the gate (npm run gate / scripts/gate.sh); it parses only `run:` lines, so a comment cannot satisfy it (tamper-tested); wired into npm test"
---
