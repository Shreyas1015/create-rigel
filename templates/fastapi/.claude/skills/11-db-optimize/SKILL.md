# /db-optimize — Query Optimization

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** SQLAlchemy 2.0, asyncpg 0.30, PostgreSQL EXPLAIN ANALYZE  

Triggered by: `/db-optimize [method-name]`

## Step 1 — Find Slow Query
```bash
# From structlog output or pg_stat_statements
psql $DATABASE_URL -c "
  SELECT query, mean_exec_time::int, calls
  FROM pg_stat_statements
  WHERE mean_exec_time > 200
  ORDER BY mean_exec_time DESC LIMIT 10;"
```

## Step 2 — EXPLAIN ANALYZE
```bash
psql $DATABASE_URL << 'SQL'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
  SELECT a.* FROM applications a
  WHERE a.user_id = 'uuid' AND a.deleted_at IS NULL
  ORDER BY a.created_at DESC LIMIT 21;
SQL
```

## Step 3 — Add Index via Alembic
Add to model `__table_args__`:
```python
Index(
    "idx_applications_user_created",
    "user_id", "created_at",
    postgresql_where=text("deleted_at IS NULL"),
)
```

Generate + run:
```bash
uv run alembic revision --autogenerate -m "add_idx_applications_user_created"
uv run alembic upgrade head
```

## Step 4 — Verify
Re-run EXPLAIN ANALYZE — confirm `Index Scan` used, time < 200ms.

## Step 5 — Commit
```bash
git add alembic/ src/models/
git commit -m "perf(db): add idx_applications_user_created

EXPLAIN before: {N}ms → after: {M}ms"
```
