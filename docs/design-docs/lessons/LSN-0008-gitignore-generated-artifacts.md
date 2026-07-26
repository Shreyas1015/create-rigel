---
id: LSN-0008
summary: "Generated/build artifacts (tsbuildinfo, next-env.d.ts) belong in .gitignore, not the repo."
status: ENFORCED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: "templates' .gitignore (*.tsbuildinfo, next-env.d.ts)"
---
## What went wrong
A scaffolded build committed `tsconfig.tsbuildinfo` and `next-env.d.ts` (DF-14) — machine-generated
files that churn and leak into diffs.

## Why it happens
Toolchains emit build artifacts into the working tree; if they aren't ignored, the first commit
captures them and every rebuild dirties the tree.

## The rule
Every generated/build artifact is gitignored in the template it ships from. If a tool writes it,
git shouldn't track it.
