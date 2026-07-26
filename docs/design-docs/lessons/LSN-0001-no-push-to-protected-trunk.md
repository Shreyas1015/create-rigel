---
id: LSN-0001
summary: "Never push to a protected trunk from an automated loop — push the current feature branch."
status: ENFORCED
seen: 3
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: "branch-protection + .githooks/pre-push (PR-only main)"
---
## What went wrong
`/build-layer` and `/garbage-collect` ran `git push origin main`, and `/write-plan` never cut a
feature branch (DF-17, DF-18, DF-38). On a real protected remote the pushes were rejected and the
solo-merge path deadlocked — none of it reproducible in a throwaway local folder.

## Why it happens
`main` is PR-only protected. The loop must run on a feature branch cut from `main` and land via
`/open-pr`; a literal `origin main` push fights the very policy the harness ships.

## The rule
Any skill that pushes uses `git push origin "$(git branch --show-current)"`, never a hardcoded
trunk name; `/write-plan` cuts the feature branch. Enforced by branch protection + the pre-push hook.
