---
id: LSN-0008
summary: "Exclude generated artifacts at EVERY copy boundary, with PATTERN-scoped rules — a path-scoped negation silently stops covering new directories."
status: ENFORCED
seen: 4
first_seen: PLAN-006
last_seen: PLAN-008
signatures: []
enforced_by: "repo .gitignore + package.json files[] pattern-scoped negations (!**/__pycache__, !**/*.py[cod]) + cli.js notGenerated filter + scripts/check-package-contents.mjs (CI, tamper-tested)"
---
