---
id: LSN-0013
summary: "A '#' is not a comment until the tool says so — an example inside a suppression file is a live rule that disables the gate it documents."
status: ENFORCED
seen: 1
first_seen: PLAN-011
last_seen: PLAN-011
signatures: []
enforced_by: "contract-gate {express,nestjs}/contract-gate.mjs + fastapi/contract_gate.py reject a '#' line matching /(GET|POST|...)\\s+\\// in .oasdiff-ignore"
---
