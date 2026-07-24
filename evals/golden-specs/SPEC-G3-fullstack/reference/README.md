# SPEC-G3-fullstack — Golden Reference Solution

Hand-verified reference for `SPEC-G3-fullstack` (PLAN-006 AC-5: "no green reference, no entry").
G3 is the hardest golden spec: a single vertical slice across **two real apps** — an Express
`api/` and a Next.js `web/` — joined by a **generated OpenAPI contract**. Both apps were built
from the current create-rigel templates, graded with each template's own `gate` + `ac:vector`
against live Postgres/Redis, and the four ACs were assembled across the two apps. This directory
is the committed proof.

## Grade

- **gate:** PASS — `npm run gate` exits 0 in **both** `api/` and `web/` (gate = PASS only if both pass).
- **acVector:** AC-1 PASS · AC-2 PASS · AC-3 PASS · AC-4 PASS
- **harness commit (create-rigel HEAD):** `9ae24ee277894934fbe5f69120dffcc72d28baba`

See `grade.json` for the machine-readable grade consumed by `evals/harness/load-golden.mjs`.

## The two apps

| | `api/` (express) | `web/` (nextjs) |
|---|---|---|
| Feature | `GET /api/v1/bookmarks/count` → `{ count }`, owner-scoped | `BookmarkCountBadge` + `useBookmarkCount` hook |
| Owns ACs | AC-1 | AC-2, AC-3 |
| Graded by | `npm run gate` + `npm run ac:vector` (jest, live DB) | `npm run gate` + `npm run ac:vector` (vitest + MSW) |

The contract boundary: `api/` registers a **typed** `/bookmarks/count` response in
`src/runtime/openapi.ts` → `npm run openapi:export` writes `docs/generated/openapi.json` → that
JSON is copied into `web/` and `npm run api:sync` regenerates `src/types/api.generated.ts` → the
hook imports its response type (`components['schemas']['BookmarkCountResponse']`) from THAT file
(AC-2), never hand-typed.

## Scaffold commands

```bash
mkdir g3 && cd g3
node /path/to/create-rigel/cli.js api --template express   # → g3/api
node /path/to/create-rigel/cli.js web --template nextjs    # → g3/web
```

- **api/**: Phase 0 (`/infra-setup`) generates the product-agnostic `src/` scaffold (config /
  providers / runtime middleware / openapi registry / utils / health route) + installs deps.
  This reference **reused the proven infra + bookmark feature from the F2 dogfood app**
  (`rigel-bookmarks-api`, itself a fresh scaffold of this exact template — its config files are
  byte-identical to a fresh `cli.js` scaffold) and added the aggregate `count` slice on top, per
  the task's "backend pattern is already proven — reuse it" guidance.
- **web/**: `/infra-setup` = Phase A (park harness → `create-next-app@latest` → restore harness)
  then Phase B (`bash .claude/scripts/infra-setup.sh`: installs TanStack Query / openapi-fetch /
  openapi-typescript / MSW / Vitest / shadcn, writes the gate/design-token/eval glue). Step-5 glue
  (`src/lib/env.ts`, `src/lib/api-client.ts`, `src/components/providers.tsx`, mocks, wrapper) was
  hand-authored per the skill. This was a **fresh, real nextjs infra-setup** (no prior reference).

## Database

A **dedicated** database `g3ref` (separate from F2's `myapp` and the G1 `g1ref`):

```bash
docker exec rigel-bookmarks-api-postgres-1 psql -U postgres -c 'CREATE DATABASE g3ref;'
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/g3ref"
export REDIS_URL="redis://localhost:6379"
export NODE_ENV=test
# in api/:
npm run db:migrate        # applies db/migrations/*-create-bookmarks.cjs (+ users)
```

`web/` needs no DB — its gate/`ac:vector` mock the API with MSW and inject `NEXT_PUBLIC_API_URL`
via `vitest.config.ts`.

## Spec-id adaptation (SPEC-001 per app)

The eval harness resolves spec ids from the active plan via `/\bSPEC-\d+\b/`
(`scripts/lib/rigel-evals.mjs`, `tests/architecture/traceability.test.ts`), and `ac:vector`
grades whatever the active plan points at. A non-numeric id like `SPEC-G3-fullstack` is invisible
to that resolver (DF-43), so **each app is built under the numeric id `SPEC-001`**, carrying its
own slice of SPEC-G3:

- `api/` `SPEC-001` = SPEC-G3 **AC-1** (the count endpoint). Its `ac:vector` grades AC-1.
- `web/` `SPEC-001` = SPEC-G3 **AC-2 + AC-3** (contract-typed hook + badge). Its `ac:vector` grades AC-2, AC-3.
- **AC-4** (both gates pass + contract up to date) is inherently cross-app, so it is graded by
  hand (below), not by a single app's `ac:vector`.

The acceptance-test titles keep the canonical `AC-1..AC-4` ids so the grade maps 1:1 onto
SPEC-G3's four ACs. The final `acVector` in `grade.json` is assembled from the two apps' real
`ac:vector` runs plus the manual AC-4 check.

## How each AC was graded (real runs)

**AC-1 — `GET /api/v1/bookmarks/count` returns 200 + `data.count` = caller's count.**
`api/` `tests/acceptance/SPEC-001/AC-1.test.ts` signs access tokens for two random users, asserts
a new user's count is `0`, creates 3 bookmarks and asserts `data.count === 3` while a second
user's bookmark is **not** counted, and asserts 401 without a token. Graded by `npm run ac:vector`
(jest, live g3ref):

```
AC vector for SPEC-001:
  AC-1: PASS

✅ all 1 AC(s) PASS.
```

**AC-2 — the frontend response type is imported from the generated contract, not hand-defined.**
`web/` `tests/acceptance/SPEC-001/AC-2.test.ts` (static contract-boundary check): asserts the hook
imports from `@/types/api.generated`, references `components['schemas']['BookmarkCountResponse']`,
that the generated file actually carries the `/bookmarks/count` path + component (proving
`api:sync` ran against the live endpoint), and that the hook hand-rolls no count-response shape.
Backed by `tsc --noEmit` (the hook's type resolves to the generated one). Graded by `ac:vector`.

**AC-3 — badge renders the count via a hook (no direct fetch), shows `0` not blank for an empty user.**
`web/` `tests/acceptance/SPEC-001/AC-3.test.tsx` renders `<BookmarkCountBadge/>` through a real
QueryClient wrapper with MSW mocking `/bookmarks/count`; asserts `"0"` renders for count 0 and
`"5"` for count 5. eslint's `no-restricted-syntax` forbids `fetch()` outside `src/hooks/`, so
"via a hook" is mechanically enforced. Graded by `ac:vector`:

```
AC vector for SPEC-001:
  AC-2: PASS
  AC-3: PASS

✅ all 2 AC(s) PASS.
```

**AC-4 — both apps pass their gate AND the API's OpenAPI contract is up to date.**
Graded by hand across both apps:
1. `npm run gate` in `api/` → exit 0. `npm run gate` in `web/` → exit 0.
2. `api/`: `npm run openapi:export` then `git diff --exit-code docs/generated/openapi.json` → exit 0 (no drift).
3. `web/`: re-copy `api/docs/generated/openapi.json`, `npm run api:sync`, then
   `git diff --exit-code src/types/api.generated.ts` → exit 0 (the generated types match the live endpoint).

## Gate output (pasted)

**`api/` `npm run gate`** (exit 0 — typecheck · lint · check:circular · test:arch · assert:tests):

```
✔ No circular dependency found!
Test Suites: 4 passed, 4 total
Tests:       10 passed, 10 total
✓ zero-tests guard: 10 tests executed (floor 1).
```

**`web/` `npm run gate`** (exit 0 — typecheck · lint · format:check · test:coverage · assert:tests · waivers:check · design:drift):

```
All matched files use Prettier code style!
 Test Files  5 passed (5)
      Tests  16 passed (16)
Statements   : 100% ( 13/13 )
Branches     : 100% ( 8/8 )
Functions    : 100% ( 3/3 )
Lines        : 100% ( 12/12 )
✓ zero-tests guard: 16 tests executed (floor 1).
✓ impeccable waivers: 0 total, all carry a reason.
✓ DESIGN.md owns meaning only — no literal values leaked from tokens.json.
```

## Reproduce

```bash
# 0. docker Postgres+Redis up; create the g3ref DB and export DATABASE_URL/REDIS_URL/NODE_ENV=test (above)

# api/
#   scaffold + infra-setup (or reuse the F2 bookmarks app), then add the count slice:
#     types  → BookmarkCountSchema
#     repo   → countForUser(userId)  (paranoid count, owner-scoped)
#     service→ count(userId)
#     route  → GET /count  (registered BEFORE GET /:id — else it 404s as id="count")
#     openapi→ register /bookmarks/count with a TYPED 200 body (BookmarkCountResponse component)
npm run redgreen:record -- SPEC-001   # AC-1 red pre-implementation
npm run db:migrate
npm run gate                          # exit 0
npm run openapi:export                # docs/generated/openapi.json now has /bookmarks/count
npm run ac:vector                     # AC-1 PASS → .rigel/ac-results/SPEC-001.json

# contract sync
cp ../api/docs/generated/openapi.json ../web/openapi.json   # (then prettier --write it in web/)

# web/
#   scaffold + infra-setup (Phase A create-next-app + Phase B script), Step-5 glue, then:
npm run api:sync                      # src/types/api.generated.ts from the contract
npm run redgreen:record -- SPEC-001   # AC-2 + AC-3 red pre-implementation
#   hook (src/hooks/use-bookmark-count.ts) + feature (src/features/bookmarks/bookmark-count-badge.tsx)
npm run gate                          # exit 0 (100% coverage of hook+feature)
npm run ac:vector                     # AC-2 + AC-3 PASS
```

## What's in `solution/`

Feature source from **both** apps (no `node_modules` / `.next` / build). `spec.md` is SPEC-G3
verbatim. Paths mirror each app's tree under `solution/api/` and `solution/web/`.

**`solution/api/`** — `src/types/bookmark.types.ts` (adds `BookmarkCountSchema`),
`src/repo/bookmark.repo.ts` (`countForUser`), `src/services/bookmark.service.ts` (`count`),
`src/runtime/routes/v1/bookmarks.route.ts` (`GET /count` before `/:id`),
`src/runtime/openapi.ts` (typed `/bookmarks/count` registration + `BookmarkCountResponse`
component), `src/models/*`, `db/migrations/*-create-bookmarks.cjs`, `docs/generated/openapi.json`
(the exported contract), the SPEC-001/PLAN-001 pair, `tests/acceptance/SPEC-001/AC-1.test.ts`, and
the `.rigel/redgreen|ac-results` proofs.

**`solution/web/`** — `src/lib/{env,api-client,api-error}.ts`,
`src/hooks/use-bookmark-count.ts` (response type imported from the generated contract),
`src/features/bookmarks/bookmark-count-badge.tsx` (`'use client'`, renders `0` not blank),
`src/components/providers.tsx`, `src/types/api.generated.ts` (the synced contract), the wired
`src/app/{layout,page}.tsx`, `openapi.json` (the synced contract copy), the SPEC-001/PLAN-001
pair, `tests/acceptance/SPEC-001/AC-2.test.ts` + `AC-3.test.tsx`, the unit tests + mocks + wrapper,
`vitest*.config.ts`, and the `.rigel` proofs.

## Notes

- **No users table needed for the count test:** `requireAuth` (Phase-0 `providers/auth`) verifies
  the JWT and reads `sub`; the AC-1 test signs access tokens directly for random user ids, and the
  count is owner-scoped purely by `where: { userId }` — matching G1's approach.
- The `api/` working app also carries F2's auth/users/bookmark-CRUD (proven infra); `solution/`
  curates only the G3 count slice (as G1/G2 curate their features). The extra endpoints appear in
  the exported contract but do not affect any AC.
