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

**Run-2 (real-repo rebuild from fixed templates) — DF-14 (nextjs, P2): FIXED.** The harness
`gitignore` (which replaces create-next-app's on park-and-restore) omitted `*.tsbuildinfo` and
`next-env.d.ts`, so `tsconfig.tsbuildinfo` (a build cache) got committed into the initial commit.
Guard: added both to `templates/nextjs/gitignore` (Build output). Class — every nextjs scaffold
would otherwise commit the cache. Both templates' gates were GREEN on rebuild; express commit +
branches pending its agent's report.

**Phase-0.5 (real-remote) — DF-15 (nextjs, P1, CLASS): FIXED.** On the real remote, `protect-branch.sh`
+ `check-protection-drift.sh` **failed on the nextjs repo but PASSED on express**. Root cause: nextjs
`.lintstagedrc.json` prettifies `*.{json,…}` (and `npm run format` is `prettier --write .`), so prettier
**reformats `.rigel/git-policy.json`'s single-line protection objects to multi-line** — which breaks the
toolchain-free single-line `grep`/`sed` policy readers in `.githooks/*`, `protect-branch.sh`, and
`check-protection-drift.sh` (`branch_bool` returns empty → `set -e` abort). Express was immune only because
the DF-1 fix scoped its lint-staged to `.ts`. The single-line format is a **load-bearing machine-read
contract**. Guard: added `.rigel/` to `templates/nextjs/.prettierignore` (covers both lint-staged and
`format`). (Deeper fragility noted for later: the shell readers assume single-line JSON — a hand-reformat
would still break them; a multi-line-robust reader is a future hardening.) Also required a live
GitHub-tier finding:

**Phase-0.5 environment — DF-16 (both, P2, doc): branch protection requires a public repo or GitHub
Pro.** On a free plan, `gh api .../branches/*/protection` returns 403 "Upgrade to Pro or make public"
for PRIVATE repos, so `protect-branch.sh` can't apply protection and the drift check silently SKIPS.
The dogfood repos were made public to verify. Guard: `docs/git-workflow.md` should note that branch
protection needs a public repo or a paid plan; the drift check already degrades gracefully (skips) rather
than false-failing. (Logged; docs note deferred with DF-11/12/13.)

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

## Run-3 (F1 auth feature build on rigel-bookmarks-api) — 14 findings, OPEN

F1 shipped (PR #1 open, 8 layers, gate green, AC-1..6 vector all PASS, loop worked). But the
feature build surfaced real gaps — several in the flagship **git-loop skills** themselves.
All OPEN (candidate fix batch before F2). CLASS unless noted.

- **DF-17 (P0, git-loop):** `/build-layer` Step 6 hardcodes `git push origin main` — contradicts the
  feature-branch model and is rejected by main's protection. Guard: push `$(git branch --show-current)`.
- **DF-18 (P0, git-loop):** **nothing cuts the feature branch** — `/write-plan` only writes the plan,
  `/open-pr` assumes `feat/PLAN-*` exists. Guard: `/write-plan` cuts `feat/PLAN-xxx-<slug>` from `main`.
- **DF-19 (P1):** `/write-spec` records red-green while the spec is in `draft/`, but `redgreen-record.mjs`
  resolves only from `ready/` → deadlock. Guard: align ordering (promote before record, or read draft).
- **DF-20 (P1):** `npm run db:migrate` broken — `.sequelizerc` → `src/config/database.ts` (TS/ESM, exports a
  Sequelize instance not CLI config) and `.js` `module.exports` migrations under `"type":"module"`. Guard:
  ship a CLI-shaped DB config + `.cjs` migrations (or an ESM-compatible runner).
- **DF-21 (P1):** OpenAPI rule vs exporter mismatch — `api.md` says register paths in the route file, but
  `openapi.export.ts` imports only `runtime/openapi.ts` → `wrote 0 path(s)` silently. Guard: register in openapi.ts.
- **DF-22 (P1):** acceptance/`ac:vector` hit real endpoints but no step provisions the DB schema. Guard:
  schema provisioning in the acceptance/eval setup.
- **DF-23 (P2):** `authLimiter` (10/min/IP) makes the app's OWN acceptance suite 429. Guard: rate-limit
  test-env bypass shipped.
- **DF-24 (P1):** per-directory coverage thresholds fail on unused scaffold code (providers/rbac, featureFlags,
  jwt.revokeToken, health 503) the first feature never touches → first feature can't pass coverage. Guard:
  scope coverage to touched layers / exclude unused scaffold.
- **DF-25 (P2):** open Redis/DB handles hang the full jest suite (module-singleton ioredis never closes).
  Guard: `forceExit` + teardown that closes handles.
- **DF-26 (P2):** shared DB + parallel jest workers race (`sync force:true`/truncate, no per-worker DB).
  Guard: `maxWorkers:1` or per-worker DB.
- **DF-27 (P2):** plan-template "Layer Build Order" is a table with no `[ ]` checkboxes, but `/build-layer`
  Step 1 looks for the first `[ ]`. Guard: align the plan template with checkboxes.
- **DF-28 (P2):** `/open-pr` title = last commit subject (a trailing `test:`/`chore:` for a multi-commit PR).
  Guard: derive the title from the spec/plan.
- **DF-29 (P0, git-loop):** **CODEOWNERS placeholders + `require_code_owner_reviews` = unmergeable first PR.**
  Protection requests zero reviewers (`@your-team/*` don't exist) → PR #1 permanently `REVIEW_REQUIRED`/BLOCKED.
  Bootstrapping deadlock. Guard: ship CODEOWNERS commented-out (or don't require codeowner review until it has
  real entries); document the one-time setup.
- **DF-30 (P2):** express CI/Actions workflows did NOT run on PR #1 (no workflow runs, no required checks).
  Needs investigating — the template ships ci.yml + git-policy.yml. Guard: confirm Actions enabled / triggers.
- **DF-31 (instance, self-corrected):** `import argon2` default vs named-only exports; and repo importing the
  model directly bypasses the `models/index` `addModels` barrel → "Model not initialized". Under-documented
  scaffold conventions (worth a skill note).

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
