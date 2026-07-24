# SPEC-G2-frontend — Golden Reference Solution

Hand-verified reference for `SPEC-G2-frontend` (PLAN-006 AC-5: "no green reference, no entry").
A real Next.js app was scaffolded from the current create-rigel **nextjs** template, implemented
to exactly SPEC-G2's spec, and graded GREEN with the template's own `gate` + `ac:vector`. This
directory is the committed proof. It is also the first frontend dogfood of the nextjs template.

## Grade

- **gate:** PASS (`npm run gate` → exit 0: typecheck + lint + format:check + test:coverage + assert:tests + waivers:check + design:drift)
- **acVector:** AC-1 PASS · AC-2 PASS · AC-3 PASS · AC-4 PASS (from `.rigel/ac-results/SPEC-001.json`)
- **coverage:** 100% statements / branches / functions / lines (5 test files, 17 unit+arch tests)
- **acceptance suite:** 4 files / 5 tests PASS (MSW-mocked, `vitest.acceptance.config.ts`)
- **harness commit (create-rigel HEAD):** `60407807a75bf6ef4028063cf3bcb10bca0a3399`

See `grade.json` for the machine-readable grade consumed by `evals/harness/load-golden.mjs`.

## Scaffold command

```bash
node /path/to/create-rigel/cli.js rigel-g2-ref --template nextjs
```

Then Phase 0 (`/infra-setup`): **Phase A** parks the harness files, runs
`npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm --yes`,
and restores the harness on top. **Phase B** runs the checked-in `bash .claude/scripts/infra-setup.sh`
(installs deps at latest LTS, `shadcn init` + base components, design tokens
`tokens.json → Style Dictionary → src/app/tokens.css @theme`, MSW/Vitest/Playwright setup,
git hooks). Then Claude authors the Step-5 glue (`env.ts`, `api-client.ts`, `providers.tsx`,
`tests/utils/create-wrapper.tsx`). Installed: Next 16.2.11, React 19.2.4, Tailwind v4.

## Spec-id adaptation (SPEC-001)

The eval harness resolves spec ids from the active plan via `/\bSPEC-\d+\b/` (see
`scripts/lib/rigel-evals.mjs`), and `ac:vector` grades whatever the active plan points at. A
non-numeric id like `SPEC-G2-frontend` is invisible to that resolver, so the reference is built
under the numeric id **`SPEC-001`** (spec content is SPEC-G2 verbatim). The four acceptance
tests keep their canonical **AC-1..AC-4** titles and grade against SPEC-G2's four ACs unchanged.
`grade.json` reports the AC ids (AC-1..AC-4), identical across the two ids.

## No database

Frontend-only. The `useBookmarks` hook calls a typed openapi-fetch client; the acceptance
tests mock `GET /api/v1/bookmarks` with **MSW** (per business rule 1 + AC-1). The API contract
(`openapi.json`) is a minimal `GET /api/v1/bookmarks` returning the canonical cursor envelope
`{ items, has_more, next_cursor_id }` with snake_case `Bookmark` fields
(`{ id, user_id, url, title, created_at }`); `/api-sync` generated `src/types/api.generated.ts`.

## How AC-4 (design-token conformance) is graded

`ac:vector` runs acceptance tests through **Vitest/jsdom**, so AC-4 is a jsdom-compatible check
rather than the Playwright computed-style pass. In this Tailwind-v4 + `@theme`-token system an
off-token color/spacing/radius/type value can only enter the rendered DOM via a Tailwind
**arbitrary-value** utility (`bg-[#fff]`, `p-[13px]`, `rounded-[7px]`, `text-[15px]`) or a raw
inline `style`. `tests/acceptance/SPEC-001/AC-4.test.tsx` renders the populated page tree and
asserts (1) no arbitrary-value class, (2) no inline `style`, (3) semantic token utilities ARE
used. This complements the two static checks the **gate** already runs: `eslint-plugin-tailwindcss`
`no-arbitrary-value` on the render layers, and the Playwright computed-style conformance in
`tests/design/token-conformance.spec.ts` (reads `tokens.json`). The feature deliberately avoids
shadcn `Card`/`Badge` (whose primitives carry arbitrary-value classes) and uses shadcn `Skeleton`
+ plain token utilities, keeping the rendered tree token-clean.

## Grade output (pasted)

`npm run gate` (exit 0):

```
> npm run typecheck && npm run lint && npm run format:check && npm run test:coverage && npm run assert:tests && npm run waivers:check && npm run design:drift
> tsc --noEmit
> eslint .
✖ 16 problems (0 errors, 16 warnings)      # warnings only (template scripts' console.*), lint has no --max-warnings
All matched files use Prettier code style!
Test Files  5 passed (5)
Tests  17 passed (17)
Statements   : 100% ( 20/20 )
Branches     : 100% ( 12/12 )
Functions    : 100% ( 8/8 )
Lines        : 100% ( 19/19 )
✓ zero-tests guard: 17 tests executed (floor 1).
✓ impeccable waivers: 0 total, all carry a reason.
✓ DESIGN.md owns meaning only — no literal values leaked from tokens.json.
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

Acceptance suite (`vitest run tests/acceptance/SPEC-001 --config vitest.acceptance.config.ts`):

```
Test Files  4 passed (4)
     Tests  5 passed (5)
```

## Reproduce

```bash
# 1. scaffold + Phase 0 (/infra-setup Phase A create-next-app, Phase B infra-setup.sh, Step-5 glue)
# 2. author openapi.json (GET /api/v1/bookmarks) at the project root, then:
npm run api:sync                         # openapi.json → src/types/api.generated.ts
# 3. drop the spec into docs/product-specs/ready/SPEC-001-bookmarks-list.md (SPEC-G2 verbatim)
#    and the 4 acceptance tests into tests/acceptance/SPEC-001/ (titled AC-1..AC-4)
npm run redgreen:record -- SPEC-001      # proves all 4 ACs RED pre-implementation
# 4. implement the feature (this directory's solution/ files):
#      src/hooks/use-bookmarks.ts, src/features/bookmarks/bookmark-list.tsx,
#      src/app/bookmarks/page.tsx (+ unit tests) — and write PLAN-001 into docs/exec-plans/active/
npm run gate                             # PASS (exit 0)
npm run ac:vector                        # AC-1..AC-4 all PASS → .rigel/ac-results/SPEC-001.json
```

> Order matters: run `gate` **before** `ac:vector` (as `gate:final` does). `ac:vector` appends
> an AC-vector block to the active plan's markdown, which a subsequent `prettier --check` in the
> gate flags until the plan is re-formatted (`prettier --write`). See DF-45 below.

## What's in `solution/`

Feature source + the artifacts that graded it (no node_modules / .next / coverage):

- `src/hooks/use-bookmarks.ts` — TanStack Query hook over the typed api-client; query-key factory; `toApiError`
- `src/features/bookmarks/bookmark-list.tsx` — `'use client'` feature: loading (skeleton) / error / empty / list, token classes only, a11y
- `src/app/bookmarks/page.tsx` — server component rendering the feature (+ `src/app/layout.tsx` Providers wiring)
- `src/lib/{api-client,env,api-error,constants}.ts`, `src/components/providers.tsx` — Phase-0 glue the feature depends on
- `src/types/api.generated.ts` (+ `openapi.json`) — the generated contract
- design-token stack: `tokens.json`, `style-dictionary.config.mjs`, `src/app/tokens.css` (@theme), `DESIGN.md`, `tests/design/token-conformance.*`
- `tests/acceptance/SPEC-001/AC-1..AC-4.test.tsx` — one per AC, titled with its AC-ID (MSW-mocked)
- `tests/unit/{hooks,features}/*` — coverage-gating unit tests; `tests/mocks/*`, `tests/utils/create-wrapper.tsx`, `tests/setup.ts`
- gate config: `package.json`, `eslint.config.mjs`, `vitest.config.ts`, `vitest.acceptance.config.ts`, `tsconfig.json`
- `docs/product-specs/ready/SPEC-001-bookmarks-list.md` (spec, SPEC-G2 verbatim) + `docs/exec-plans/active/PLAN-001-bookmarks-list.md` (plan)
- `.rigel/redgreen/SPEC-001.json` (RED proof) + `.rigel/ac-results/SPEC-001.json` (graded AC vector, all PASS)

## Dogfood findings (nextjs template, first frontend build)

- **DF-42 (does NOT reproduce as an exit(1) blocker on nextjs):** `infra-setup` ships
  `.env.example` but not `.env`. Unlike the express template, `src/lib/env.ts` `throw`s (browser
  context) rather than `process.exit(1)`, and both the gate's Vitest run and `ac:vector` inject
  `NEXT_PUBLIC_API_URL` via `vitest.config.ts`, so the graded path never needs `.env`. A `.env`
  is only required for `npm run dev` / `build` / Playwright — created here with a dev default.
- **DF-43 (reproduces):** the `SPEC-\d+` id resolver ignores `SPEC-G2-frontend`; graded under
  `SPEC-001` (see adaptation note above).
- **DF-45 (new):** `ac:vector` appends an AC-vector block to the active plan's `.md`; a later
  `prettier --check` in the gate then fails on that unformatted block. Benign given the
  `gate → ac:vector` order (`gate:final`), but a re-gate after grading needs `prettier --write`.
