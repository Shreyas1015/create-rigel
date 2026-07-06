# /api-sync — Regenerate API Types from OpenAPI Spec

> **Verified:** 2026-06-05 · **Staleness threshold:** 60 days
> **Source:** openapi-typescript (https://openapi-ts.dev/)
> If older than the threshold, fetch current `openapi-typescript` docs via `ctx7` (wired
> in `.mcp.json`), or `WebFetch`/`WebSearch` if ctx7 is unavailable, before running — its
> CLI flags and output shape change between majors.

Triggered by: /api-sync

## What it does
Regenerates src/types/api.generated.ts from openapi.json in the project root.
This is the source of truth for all API types in the frontend.

## Steps

### Step 1 — Check spec file
```bash
ls openapi.json 2>/dev/null
```
If missing: tell human to copy openapi.json from backend to project root.
  - FastAPI backend: generate at http://localhost:8000/openapi.json
  - Express backend: copy from docs/generated/openapi.json

### Step 2 — Regenerate
```bash
npm run api:sync
# which runs: openapi-typescript openapi.json -o src/types/api.generated.ts
```

### Step 3 — TypeScript check
```bash
npm run typecheck 2>&1
```
List every file with errors — these are places that need updating after the contract changed.

### Step 4 — Call contract-checker agent
Check for hand-written types that duplicate the generated ones.

### Step 5 — Commit
```bash
git add src/types/api.generated.ts openapi.json
git commit -m "chore(api): sync contract from backend openapi.json"
git push origin main
```

## Rules
- NEVER edit api.generated.ts manually
- Always run typecheck after sync — errors = contract drift to fix
- Run before starting every new feature
