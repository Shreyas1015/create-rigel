---
id: LSN-0008
summary: "Generated/build artifacts belong in .gitignore — never the repo, never the published package."
status: ENFORCED
seen: 2
first_seen: PLAN-006
last_seen: PLAN-007
signatures: []
enforced_by: "templates' gitignore (*.tsbuildinfo, next-env.d.ts, __pycache__) + repo .gitignore (__pycache__, *.py[cod]) + scripts/check-package-contents.mjs (CI, tamper-tested)"
---
