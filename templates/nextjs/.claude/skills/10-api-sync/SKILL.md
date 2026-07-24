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

### Step 1b — Normalize openapi.json formatting

The backend emits `openapi.json` in its own shape, but this repo's gate/CI runs
`format:check` (`prettier --check .`) over the whole tree — and `openapi.json` is **not** in
`.prettierignore`. So a verbatim copy makes `format:check` fail and `git diff openapi.json` show
formatting-only churn even when the contract is byte-identical. Reformat it once, in place, so the
committed artifact is already prettier-clean:

```bash
npx prettier --write openapi.json
```

This only restyles whitespace — it never changes the contract. (If you'd rather not format it, the
alternative is to add `openapi.json` to `.prettierignore`; the `prettier --write` above is preferred
so the file stays consistent with the rest of the repo.)

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
- `src/types/api.generated.ts` is the reliable, up-to-date contract artifact the app consumes —
  `openapi.json` is only the transient input (prettier-normalized in Step 1b so it doesn't churn the
  gate/`git diff`). Trust the generated types, not a hand-comparison of `openapi.json` formatting.
