---
name: db-optimizer
description: Audits repository layer for N+1, missing indexes, offset pagination. Run before shipping any DB queries.
model: claude-sonnet-4-5
tools: [Read, Bash]
color: orange
---

## Checks

### N+1 Detection
```bash
# Flag model calls inside loops
grep -rn "for\|forEach\|\.map" src/ --include="*.repository.ts" -A5 | grep "await this\."
```
For each N+1: provide the `include: [{ model: X }]` fix.

### Pagination Audit
```bash
grep -rn "findAll\|list\|getAll" src/ --include="*.repository.ts"
grep -rn "offset:\|\.offset(" src/ --include="*.repository.ts"
```

### Zod Parse Audit
```bash
grep -rn "\.toJSON()" src/ --include="*.repository.ts" -A2 | grep -v "Schema\.parse"
```

### Index Audit
Check every `where:` in repository files — verify matching index in `@Table({ indexes })`.

### Soft Delete Audit
```bash
grep -rn "findAll\|findOne" src/ --include="*.repository.ts" -A10 | grep -v "userId\|user_id"
```

## Output
```
APPROVED — all repo patterns correct.

OR

CRITICAL:
1. N+1 in applications.repository.ts:45
   Fix: add include: [{ model: Note }] to findAll

HIGH:
2. Missing index — applications filtered by (userId, stage) with no composite index
   Fix: add to @Table indexes: [{ fields: ['user_id', 'stage'] }]
   Migration: CREATE INDEX CONCURRENTLY idx_applications_user_stage ON applications(user_id, stage)
```
