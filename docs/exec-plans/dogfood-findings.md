# Dogfood findings — PLAN-006 AC-2b

Harness bugs found while dogfooding the templates on a real product build
(`rigel-bookmarks-api` = express, `rigel-bookmarks-web` = nextjs). Logged as INSTANCE or
CLASS; a class gets a mechanical guard so it can't recur. Nothing found is dropped.

**Run 1 — Phase 0 infra-setup only (no feature code yet), two parallel agents.**
Method: `npm create` (local cli) → each template's `/infra-setup` → observe `npm run gate`.

Severity: **P0** blocks the build/commit · **P1** breaks a gate/commit path · **P2** noise/quality · **doc** stale instruction.

## Resolution — Run-1 fix batch (verified end-to-end)

**DF-1 … DF-10: FIXED and VERIFIED** on fresh scaffolds from the fixed templates (real
`create-rigel` → `/infra-setup` → gate, in isolated scratch dirs — not parsed):
- **nextjs** gate **GREEN** (all 7 steps): DF-2 (demo page → token placeholder, eslint 0 errors),
  DF-3 (MSW mocks stub → typecheck clean, 10 tests run), DF-4 (eslint warnings 468 → **16**;
  vendored Impeccable + `*.umd.js` produce zero lint output), DF-5 (`impeccable install` took
  defaults via `</dev/null`, no hang).
- **express** gate **GREEN** + DF-1 blocker gone: a real `git commit` succeeded with hooks active,
  **no `--no-verify`** (lint-staged now feeds tests to prettier-only). DF-6 (`boundaries@6.0.2`, no
  deprecation), DF-7 (no ts-jest `TS151002`), DF-8 (`prettier --check` clean), DF-9 (blank OTEL
  endpoint loads).
- No new bugs, no regressions. These become the v0.7.1 hardening commit.

**DF-11, DF-12, DF-13: OPEN (deferred — outside the DF-1…DF-10 batch by scope).** Still to do:
setup.ts helper-signature contract (DF-11), redundant skill Step-8 "Write ADR-000" (DF-12),
skill doc-drift sentences (DF-13). Kept logged here; not fixed in this batch.

## Blockers (must fix before feature builds F1+)

| ID | Template | Sev | Class? | What broke | Mechanical guard | Status |
|---|---|---|---|---|---|---|
| DF-1 | express | P0 | class | Pre-commit hook can't parse `tests/**/*.ts`: lint-staged runs `eslint --fix` on every staged `*.ts`, but `eslint.config.mjs` only wires the TS parser under `src/**/*.ts`; test files fall back to espree → `Parsing error: Unexpected token :`. **The first commit (and any commit staging a test file) is blocked** — agent had to `--no-verify`. Invisible to `npm run lint` (src-only). | Scope lint-staged to `src/**/*.ts` (+ `*.ts`→prettier only), OR add a `tests/**/*.ts` block with `languageOptions.parser: tsparser` to the flat config. | TO FIX |
| DF-2 | nextjs | P1 | class | `tailwindcss/no-arbitrary-value` (PLAN-005 AC-2) **errors on create-next-app's demo `page.tsx`** (`hover:bg-[#383838]`, `md:w-[158px]`…); no autofix. Skill says keep the demo page → **gate lint can't go green on a fresh scaffold.** | `infra-setup.sh` replaces `src/app/page.tsx` with a minimal token-clean placeholder (Step 8b), or the skill instructs replacing the demo page before first gate. | TO FIX |
| DF-3 | nextjs | P1 | class | Script writes `tests/setup.ts` importing `./mocks/server`, but `tests/mocks/server.ts`+`handlers.ts` are Step-5 hand-authored → **typecheck + test:coverage fail immediately**, all arch tests un-loadable right after infra-setup. | Script also writes stub `tests/mocks/{server,handlers}.ts` (bare MSW `setupServer([])` — pure boilerplate), or `setup.ts` tolerates a missing mocks module until Step 5. | TO FIX |

## Class bugs — fix as mechanical guards (v0.7.1)

| ID | Template | Sev | What broke | Guard | Status |
|---|---|---|---|---|---|
| DF-4 | nextjs | P2 | `impeccable install` (PLAN-005) vendors code into `.claude/skills/impeccable/**` + `.github/skills/impeccable/**`, not git/eslint-ignored → `eslint .` lints a ~13k-line minified `*.umd.js`; 468 warnings. | Add `**/skills/impeccable/**` + `**/*.umd.js` to eslint `ignores` and `.gitignore`. | TO FIX |
| DF-5 | nextjs | P2 | `npx impeccable install` (PLAN-005) is **interactive** (prompts install target/location); only survived because stdin wasn't a TTY — real terminal prompts/hangs, breaking Phase-B determinism. `\|\| echo` covers exit, not a hang. | Pass a non-interactive/target flag, and run with `</dev/null` + a `timeout`. | TO FIX |
| DF-6 | express | P1 | `eslint-plugin-boundaries` installed unpinned → v7.0.2, but config uses the v6 `rules`/selector API → deprecation warnings every lint/gate/CI run. Enforcement still fires (v7 back-compat) — noise, not a hole, today. | Pin the boundaries major in the install list, or migrate config to v7 `policies`. Same "unpinned dep drifts past the config" class the skill already guards for sequelize/typescript. | TO FIX |
| DF-7 | express | P2 | `tsconfig` uses `module: NodeNext` without `isolatedModules: true` → ts-jest prints `TS151002` on every test worker (×4) each gate run. | Add `isolatedModules: true` to tsconfig. | TO FIX |
| DF-8 | express | P2 | Shipped `tests/architecture/{assertion-integrity,layers,traceability}.test.ts` fail the repo's own `prettier --check` → `format:check` red on a pristine scaffold (not in gate/CI, so non-blocking). | Pre-format shipped template files; add `prettier --check` to CI. | TO FIX |

## Instances / rough edges

| ID | Template | Sev | What | Fix | Status |
|---|---|---|---|---|---|
| DF-9 | express | P1 | OTEL env `z.string().url().optional()` **rejects blank `""`** but `.env.example` ships it blank → env validation `exit(1)` if that `.env` loads. Comment claims "blank ⇒ no-op". | Ship `z.preprocess(v => v === '' ? undefined : v, z.string().url().optional())`. | TO FIX |
| DF-10 | express | P2 | Skill lists `dotenv` as a dep but never loads it → `npm run dev` wouldn't read `.env`. | Skill: `import 'dotenv/config'` at the top of `env.ts`. | TO FIX |
| DF-11 | express | P2 | `tests/integration/setup.ts` helper contract (`createUser`/`authTokenFor`/`resetDb`) not pinned by the skill → agent first wrote a mismatched shape vs the isolation template. | Skill pins the helper signatures so setup.ts and the isolation template agree. | TO FIX |
| DF-12 | nextjs | doc | Skill Step 8 "Write ADR-000" would clobber the template-shipped `ADR-000`. | Drop/rewrite Step 8 (ADR-000 ships already). | TO FIX |
| DF-13 | nextjs+express | doc | Skill Step 1 "one overlap (.gitignore)" understates the restore-overlap set (`AGENTS.md`, `eslint.config.mjs`…); express gate-description omits `assert:tests`; Step-6 "already exists" list omits shipped arch tests. | Soften/refresh the stale skill sentences. | TO FIX |

## Positives confirmed live
- Both templates' `/infra-setup` complete; nextjs PLAN-005 design stack fully works
  (tokens→@theme, design:drift/waivers:check green, impeccable detector installed).
- Express **gate is green** post-infra (typecheck·lint·circular·arch·**assert:tests → "10 tests executed"**).
- Zero-tests guard (AC-1) behaves correctly on both runners (express passes via arch tests;
  nextjs writes count=0 and the guard fails standalone).
- `eslint-plugin-boundaries` enforcement still fires under v7 (probed with a bad import).

## Not yet exercised (Run 2+ — feature builds)
git loop on real remotes · protect-branch drift · cross-user isolation (404) · cursor
pagination · background job · external-API Zod boundary · frontend states · vision-judge ·
contract drift · holdout tamper · Impeccable slop→exit2 ordering · token-change→drift.
