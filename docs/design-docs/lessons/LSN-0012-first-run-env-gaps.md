---
id: LSN-0012
summary: "First-run-only paths break new users while every component test stays green — gate them mechanically."
status: ENFORCED
seen: 3
first_seen: PLAN-006
last_seen: PLAN-009
signatures: []
enforced_by: "scripts/check-park-list.mjs (CI, tamper-tested) + infra-setup creates .env (express/nestjs/fastapi)"
---
