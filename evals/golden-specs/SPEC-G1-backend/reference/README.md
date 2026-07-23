# SPEC-G1-backend — Golden Reference Solution

Hand-verified reference for `SPEC-G1-backend` (PLAN-006 AC-5: "no green reference, no entry").
A real Express app was scaffolded from the current create-rigel express template, implemented
to exactly SPEC-G1's spec, and graded GREEN with the template's own `gate` + `ac:vector` against
a live Postgres/Redis. This directory is the committed proof.

## Grade

- **gate:** PASS (`npm run gate` → exit 0: typecheck + lint + check:circular + test:arch + assert:tests)
- **acVector:** AC-1 PASS · AC-2 PASS · AC-3 PASS · AC-4 PASS (from `.rigel/ac-results/SPEC-001.json`)
- **full test suite:** 11 suites / 30 tests passed (`npm test` → exit 0)
- **harness commit (create-rigel HEAD):** `777dce176437273c0a7c75fd4591b18ee77de7ff`

See `grade.json` for the machine-readable grade consumed by `evals/harness/load-golden.mjs`.

## Scaffold command

```bash
node /path/to/create-rigel/cli.js rigel-g1-ref --template express
```

Then Phase 0 (`/infra-setup`): `npm install` the documented stack, generate the `src/` scaffold,
`git init`, activate `.githooks`. The product-agnostic Phase-0 files (config / providers /
runtime middleware / utils / health route) are the template's infra-setup output.

## Database

A **dedicated** database `g1ref` (kept separate from the F2 bookmarks app's schema):

```bash
docker exec rigel-bookmarks-api-postgres-1 psql -U postgres -c 'CREATE DATABASE g1ref;'
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/g1ref"
export REDIS_URL="redis://localhost:6379"
export NODE_ENV=test
npm run db:migrate        # applies db/migrations/*-create-bookmarks.cjs
```

## Spec-id adaptation (SPEC-001)

The eval harness resolves spec ids from the active plan via `/\bSPEC-\d+\b/` (see
`scripts/lib/rigel-evals.mjs` and `tests/architecture/traceability.test.ts`), and `ac:vector`
grades whatever the active plan points at. A non-numeric id like `SPEC-G1-backend` is invisible
to that resolver, so the reference is built under the numeric id **`SPEC-001`** (spec content is
SPEC-G1 verbatim). The four acceptance tests keep their canonical **AC-1..AC-4** titles and grade
against SPEC-G1's four ACs unchanged. `grade.json` reports the AC ids (AC-1..AC-4), which are
identical across the two ids.

## Grade output (pasted)

`npm run gate` (exit 0):

```
> npm run typecheck && npm run lint && npm run check:circular && npm run test:arch && npm run assert:tests
> tsc --noEmit
> eslint src/ --max-warnings=0
> madge --circular src/ --extensions ts
✔ No circular dependency found!
> jest tests/architecture/
Test Suites: 4 passed, 4 total
Tests:       10 passed, 10 total
✓ zero-tests guard: 10 tests executed (floor 1).
```

`npm run ac:vector` (exit 0):

```
AC vector for SPEC-001:
  AC-1: PASS
  AC-2: PASS
  AC-3: PASS
  AC-4: PASS

✅ all 4 AC(s) PASS.
```

`npm test` (exit 0):

```
Test Suites: 11 passed, 11 total
Tests:       30 passed, 30 total
```

## Reproduce

```bash
# 1. scaffold + Phase 0 infra-setup (npm install, src/ scaffold, git init)
# 2. create the g1ref DB and export DATABASE_URL / REDIS_URL / NODE_ENV=test (above)
# 3. drop the spec into docs/product-specs/ready/SPEC-001-bookmarks.md
#    and the 4 acceptance tests into tests/acceptance/SPEC-001/ (titled AC-1..AC-4)
npm run redgreen:record -- SPEC-001     # proves all 4 ACs RED pre-implementation
# 4. implement the feature (this directory's solution/ files) + wire:
#      app.ts        → app.use('/api/v1/bookmarks', bookmarksRouter)
#      models/index  → sequelize.addModels([Bookmark])
#      openapi.ts    → register the 3 bookmark paths
npm run db:migrate
npm run gate                            # PASS (exit 0)
npm test                                # 30 passed
npm run ac:vector                       # AC-1..AC-4 all PASS → .rigel/ac-results/SPEC-001.json
```

## What's in `solution/`

Feature source only (no node_modules / build). Paths mirror the app tree:

- `src/types/bookmark.types.ts` — Zod schemas (full row, public `{id,userId,url,title,createdAt}` projection, create body with http(s)-url + 1–200-title rules)
- `src/models/Bookmark.model.ts` (+ `src/models/index.ts` registration) — paranoid, UUIDv7, `(user_id, created_at, id)` index
- `db/migrations/20260723120000-create-bookmarks.cjs` — `.cjs` migration, runs clean, has `down()`
- `src/repo/bookmark.repo.ts` (+ `src/repo/index.ts`) — owner-scoped `where {id,userId}`, keyset cursor on `(createdAt,id)`, Zod-parsed rows, no offset
- `src/services/bookmark.service.ts` — no express/provider imports; `NotFoundError` → 404
- `src/runtime/routes/v1/bookmarks.route.ts` — `requireAuth` first, 422 on invalid body, cursor in `meta.nextCursor`
- `tests/acceptance/SPEC-001/AC-1..AC-4.test.ts` — one per AC, titled with its AC-ID
- `tests/integration/bookmark.isolation.test.ts` — cross-user isolation (404, never 403)
- `docs/product-specs/ready/SPEC-001-bookmarks.md` — the spec (SPEC-G1 verbatim)
- `docs/exec-plans/active/PLAN-001-bookmarks.md` — the execution plan
- `.rigel/redgreen/SPEC-001.json` — recorded RED proof (pre-implementation)
- `.rigel/ac-results/SPEC-001.json` — the graded AC vector (all PASS)

## Notes

- G1 needs no users table or auth routes: `requireAuth` (Phase-0 `providers/auth`) verifies the
  JWT and reads `sub`; the tests sign access tokens directly for two distinct random user ids.
  Ownership/isolation is enforced purely by owner-scoped `userId` queries in the repo.
- F2's extras (note / tags / status / update / PATCH / GET-by-id) are intentionally omitted — the
  reference is trimmed to exactly SPEC-G1 (create / list / delete; `{id,userId,url,title,createdAt}`).
