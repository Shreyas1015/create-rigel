---
name: 10-db-optimize
description: /db-optimize — Query Optimization Workflow
verified: 2026-06-04
libraries: [sequelize, pg]
source: https://sequelize.org/docs/v6/
staleness-threshold-days: 60
---

# /db-optimize — Query Optimization Workflow

Triggered by: `/db-optimize [method-name or file]`

---

## Step 1 — Find the Slow Query
```bash
# From logs (pino + your log aggregator)
# Or from pg_stat_statements:
psql $DATABASE_URL -c "
  SELECT query, mean_exec_time::int, calls
  FROM pg_stat_statements
  WHERE mean_exec_time > 200
  ORDER BY mean_exec_time DESC LIMIT 10;
"
```

## Step 2 — Run EXPLAIN ANALYZE
```bash
# Replace with the actual query being executed
psql $DATABASE_URL << 'SQL'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT a.*, n.id as note_id, n.content
  FROM applications a
  LEFT JOIN notes n ON n.application_id = a.id
  WHERE a.user_id = 'uuid-here' AND a.deleted_at IS NULL
  ORDER BY a.created_at DESC LIMIT 21;
SQL
```

## Step 3 — Read the Output
| Output | Problem | Fix |
|---|---|---|
| `Seq Scan` on large table | Missing index | Add B-tree index on filter column |
| `Rows Removed >> returned` | Index too broad | Add partial index |
| `Nested Loop` with large outer | N+1 at DB level | Add composite index or use Hash Join |
| `Sort` without `Index Scan` | ORDER BY without index | Add index on sort column |

## Step 4 — Add Index via Migration
```bash
npx sequelize-cli migration:generate --name add-idx-{table}-{columns}
```

```javascript
// In the generated migration file:
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY idx_{table}_{col} ON {table}({col}) WHERE deleted_at IS NULL'
    )
  },
  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_{table}_{col}')
  },
}
```

```bash
npx sequelize-cli db:migrate
```

## Step 5 — Also Add to Model
```typescript
// src/models/{Entity}.model.ts
@Table({
  tableName: '{table}',
  paranoid: true,
  indexes: [
    { fields: ['{col}'], where: { deleted_at: null }, name: 'idx_{table}_{col}' },
  ],
})
```

## Step 6 — Verify
Re-run EXPLAIN ANALYZE — confirm `Index Scan` is used and execution time < 200ms.

## Step 7 — Attach to Commit
```bash
git add db/migrations/ src/models/
git commit -m "perf(db): add index idx_{table}_{col}

EXPLAIN ANALYZE before: {N}ms
EXPLAIN ANALYZE after:  {M}ms

Query: [description]"
```
