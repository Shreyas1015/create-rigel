---
id: LSN-0008
summary: "Generated artifacts must be excluded at EVERY boundary that copies files — git, npm pack, and the scaffolder. None implies the others."
status: ENFORCED
seen: 3
first_seen: PLAN-006
last_seen: PLAN-007
signatures: []
enforced_by: "repo .gitignore (git) + package.json files[] negations (npm pack) + cli.js notGenerated filter (scaffold copy) + scripts/check-package-contents.mjs (CI backstop, tamper-tested)"
---
