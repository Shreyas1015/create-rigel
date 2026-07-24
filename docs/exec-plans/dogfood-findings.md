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

### Run-3 fix status
- **DF-17, DF-18 — FIXED + committed** (git-loop skills: `/write-plan` cuts the feature branch;
  `/build-layer` pushes the current branch, not main). All 4 templates.
- **DF-29 — FIXED** (solo-friendly branch protection). `git-policy.json` protection now defaults to
  0 approvals / no code-owner review / `enforce_admins:false` (PR-only + no force-push still on);
  `protect-branch.sh` + `check-protection-drift.sh` read those fields; a `protection_note` documents
  hardening for teams. A solo maintainer can now merge their own PRs. All 4 templates (byte-identical).
- **DF-20/21/22/23/24/25/26 (express pipeline) — FIXED** (verified): `db:migrate` via a new
  `db/config.cjs` + `.cjs` migrations (root cause reproduced AND fix confirmed against the real
  sequelize-cli 6.6.5 / umzug 2.3.0); OpenAPI now registers in `openapi.ts` (rule + skill aligned to
  the exporter); jest `globalSetup` `provision-schema.mjs` runs migrations (guarded — DB-free arch
  gate + red-green recording unaffected); coverage excludes unexercised scaffold (rbac/featureFlags)
  without weakening feature thresholds; rate-limit test-env skip; `forceExit` + `maxWorkers:1`.
  Consistency edits across `database.md`, `03-write-plan`, `04-build-layer`, `10-db-optimize`
  (migrations are `.cjs`; index CONCURRENTLY only on populated tables).
- **New residuals (logged):** **DF-32** — jest `coverageThreshold` with a zero-file path glob throws
  "coverage data not found" (latent; a pre-feature / provider-only commit could trip it). **DF-24-residual**
  — F1's own coverage gap is *feature test debt* (it never tested its 401/409/revoked-token branches),
  NOT a scaffold issue; a feature that follows `testing.md` meets thresholds. **DF-27/28/30/31** doc nits
  still OPEN.

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

---

## Run 4 — Port fixes into the live repo (F2 prerequisite)

Before building F2, the pipeline + git-loop fixes (made in create-rigel *after* `rigel-bookmarks-api`
was scaffolded from the post-DF-1..16 templates) were ported into the live repo via the real git loop
on branch `chore/PLAN-001-pipeline-sync`:

- **Ported:** `db/config.cjs` + `.sequelizerc`, `.js`→`.cjs` migration, `provision-schema.mjs`
  globalSetup, jest config (DF-20/22/24); solo-friendly `git-policy.json` + `protect-branch.sh` +
  `check-protection-drift.sh` (DF-29); `03-write-plan`/`04-build-layer` branch-cut + push-current
  (DF-17/18); `.cjs` skill/rule guidance.
- **DF-29 — LIVE-VERIFIED:** re-ran `protect-branch.sh` → main + staging synced to solo-friendly;
  `check-protection-drift.sh` ✓ on **both** branches; **PR #2 opened and squash-merged solo** with no
  approval deadlock. The DF-29 fix works end-to-end on a real remote, not just in the template.
- **DF-17/18 — LIVE-VERIFIED (partial):** the chore branch was cut off `main` and pushed as the
  current branch (never `main`); `/open-pr` landed it. Full loop re-verified again by F2.
- **Gate:** db-free gate green post-port (zero-tests guard: 10 tests executed).

### Run-4 fix status — P2 doc nits + DF-30 investigation
- **DF-27 — FIXED (express; propagating to nextjs/nestjs/fastapi):** the `/write-plan` plan template's
  "Layer Build Order" was a checkbox-less table while `/build-layer` greps for the first `- [ ]` item and
  ticks `- [ ] Layer N: {Name}`. Converted the template to a checklist with that exact prefix; aligned
  `/build-layer` Step 1 wording (table → checklist). (An LLM agent worked around it before — hence P2 —
  but the literal instruction was broken.)
- **DF-28 — FIXED (express; propagating):** `/open-pr` now titles the PR from the active plan
  (`PLAN-XXX — <title>`) instead of the last commit subject (which was often a trailing `test:`/`chore:`).
- **DF-31 — FIXED (express; propagating where applicable):** `security.md` documents argon2's default-only
  export (`import argon2 from 'argon2'`, `argon2.verify(hash, pw)`); `database.md` documents importing
  models through the `src/models` `addModels` barrel (direct model-file import → "Model not initialized").
- **DF-30 — INVESTIGATED, verdict deferred.** Triggers are correct (ci.yml `push:[main]`+`pull_request`;
  git-policy.yml `pull_request:[main,staging]`), Actions is **enabled**, and all 4 workflows are **on
  `main`** and registered active — yet the repo has **0 workflow runs total**, and PR #2's merge (a push
  to `main`) produced none. Leading hypothesis: PR #1 introduced the workflows onto an empty `main` so it
  couldn't trigger them (GitHub runs the *base* branch's workflow), and PR #2 was opened+squash-merged
  within seconds so its `pull_request` runs were never scheduled before the head branch was deleted. The
  **decisive probe is F2's PR** (open through a multi-minute build) — check `gh run list` after F2 lands.
  If still 0 runs, this is a genuine "CI never fires" defect worth deeper investigation.

### Observation (not a template defect) — migration file rename vs SequelizeMeta
Renaming an already-applied migration `…-create-users.js` → `.cjs` orphaned its `SequelizeMeta` row
(Sequelize keys on filename), so `db:migrate` re-ran it and collided ("relation … already exists"). This
only bites when you *rename an applied migration* — which the templates never instruct. A fresh project
scaffolds `.cjs` from the first feature, so it never happens. Surfaced only because the dogfood repo was
retrofitted; resolved by resetting the throwaway test DB and migrating clean (`.cjs` applied in 0.011s).

---

## Run 5 — F2: Bookmarks CRUD (SPEC-002 / PLAN-002) — SHIPPED

Second real feature through the full loop (spec → plan → 7 layers → PR → solo squash-merge) on the
hardened live repo, against the live Dockerised Postgres/Redis.

**Outcome:** SHIPPED. PR #3 squash-merged solo (main `ccb0e8f`). **AC-vector #2: 7/7 PASS**
(`.rigel/ac-results/SPEC-002.json`), each proven red pre-impl. Full suite **96 tests / 28 suites green**;
`test:coverage` exit 0 (all per-layer thresholds met after auto-fixes). Bookmarks repo/service/route
coverage 90–100%. Gate attempts: every layer green in ≤2 tries, **no 3× escalation**.

**Git-loop re-verification (DF-17/18/29):** branch cut off `main` (write-plan Step 4b); 10 commits pushed
to `feat/PLAN-002-bookmarks`, **zero** direct to `main`; commit-msg + pre-push hooks passed every commit;
PR merged solo (DF-29 solo-friendly protection worked). All three P0 git-loop fixes confirmed on a second
real feature.

### DF-30 — CONFIRMED DEFECT (verdict in)
F2's PR #3 was open through a ~1 hr build and then merged (a push to `main`) — **still 0 `push`/
`pull_request` workflow runs**, across **3 PRs + 3 merges**. A manual `workflow_dispatch` of
`mutation-nightly.yml`, by contrast, **ran immediately** (run 30027167848). So: Actions is enabled and the
pipeline executes on demand, but `push`/`pull_request` events never trigger. The template config is
verifiably correct (ci.yml `push:[main]`+`pull_request`; git-policy.yml `pull_request:[main,staging]`;
workflows present on `main`; `actions/permissions` = enabled/all). Root cause is therefore **not in the
template** — it is GitHub account/identity/repo-state specific (e.g. the push identity not raising events,
or a one-time Actions activation). **Action:** the maintainer must confirm CI fires on the first real PR in
the GitHub UI; add a setup-doc step to verify this. Deterministic gates still run locally via `npm run gate`
and the git hooks, so the loop is protected even while remote CI is dark — but the CI gate must be proven
live before relying on it.

### F2 findings (DF-33..DF-41)
- **DF-33 (P1, template defect) — FIXING:** `redgreen:record` can't find a spec still in `draft/`
  (`findSpecFile` searches only `ready/`, but `/write-spec` records red-green before promoting). Fix:
  `findSpecFile` searches `ready/` + `draft/`.
- **DF-34 (P1, inconsistency) — FIXING:** isolation-test arch gate fires at the **Repo** layer, but the
  plan/build-layer schedule the isolation test under **Tests**. Fix: schedule it with the Repo layer.
- **DF-35 (P1, defect) — FIXING:** validation status contradiction — `testing.md` asserts **422**, the
  generated errorHandler maps ZodError → **400**. Fix: unify on **422** (`VALIDATION_ERROR`).
- **DF-36 (P2, process+debt) — LOGGED:** coverage was already red on `main` because F1 never ran
  `/garbage-collect` (which runs coverage). `providers/redis.ts` inline callbacks are untestable → repo
  TD-003. A fresh feature adding provider unit tests clears the aggregate (F2 did). Watch: consider shipping
  provider unit tests / excluding boot-wiring from coverage in the template.
- **DF-37 (P1, gotcha) — FIXING:** Express 5 inline route middleware (`router.post('/', idempotency, h)`)
  degrades `req.params` typing → `tsc` fails under `exactOptionalPropertyTypes`. Fix: `api.md` mounts
  idempotency via `router.use(...)`.
- **DF-38 (P1, defect) — FIXING:** `/garbage-collect` Step 8 does `git push origin main` — incompatible with
  PR-only protection (same class as DF-17). Fix: gc runs on the feature branch (final pre-PR step); pushes
  the current branch, lands via the PR.
- **DF-39 (P2, policy drift) — LOGGED:** merge-method not enforceable per-branch by GitHub — policy says
  `feature_to_main: merge` and `/open-pr` says "never squash a feat→main", but a manual
  `gh pr merge --squash` succeeded (repo-wide buttons enable squash). Enforcement relies on `/open-pr`
  choosing the method; a manual squash bypasses it. Reconcile policy ↔ repo settings, and prefer letting
  `/open-pr` perform the merge with the policy method.
- **DF-40 ≡ DF-27 (already FIXED):** F2 re-hit the plan-checkbox mismatch because the live repo carried the
  pre-DF-27 skills; confirms DF-27 was real. No new work — templates already fixed (833d409).
- **DF-41 (P2, gap) — LOGGED:** `tests/integration/setup.ts::createUser()` mints an id+token but never
  INSERTs the user; with an FK to `users` that violates the constraint on insert. F2 worked around it by
  registering real users via `POST /auth/register`. Fix: once a User model+table exist, `createUser` should
  persist (or the isolation template should register via the auth endpoint).

---

## Run 6 — Part B AC-5: golden reference builds

### G1 (SPEC-G1-backend, express) — BUILT · GRADED GREEN · ADMITTED
A fresh express app (3rd clean-template dogfood) scaffolded from the fixed template, implementing
G1's spec (bookmarks create/list/delete, `{id,userId,url,title,createdAt}`, 422/401/404/cursor),
graded against a dedicated `g1ref` DB: `npm run gate` PASS, `ac:vector` AC-1..4 all PASS, 30 tests
green. `reference/{grade.json,README.md,solution/}` emitted; `load-golden` → G1 admitted. Harness
commit `777dce1`.

### New findings from the fresh-scaffold build
- **DF-42 (P1-ish, defect) — TODO:** `/infra-setup` never creates `.env`, but `src/config/env.ts`
  does `process.exit(1)` when `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET` are absent — so a clean
  builder following the skill can't run infra-setup's own `npm run dev` / `/health` gate steps or
  any DB test until they hand-create `.env`. Fix: infra-setup writes `.env` from `.env.example`
  with test-safe defaults (dev `JWT_SECRET`), or the scaffolder emits one.
- **DF-43 (P2, footgun) — TODO:** the harness resolves spec ids via `/\bSPEC-\d+\b/`, and
  `ac:vector` (no id arg) prints "no active plan/spec — nothing to grade" and **exits 0** when an
  active plan's id doesn't resolve (e.g. a non-numeric `SPEC-G1-backend`) — a green-looking exit
  that graded nothing. Fix: let `ac:vector` accept an explicit spec id (like `redgreen:record`),
  and/or exit non-zero when an active plan exists but its id didn't resolve. (G1 was built under a
  numeric `SPEC-001` id with G1's content to sidestep this — the grade is legitimate.)

### G2 (SPEC-G2-frontend, nextjs) — BUILT · GRADED GREEN · ADMITTED
First real dogfood of the nextjs template. A fresh app (create-next-app + `infra-setup.sh` +
design-token stack: tokens.json → Style Dictionary → Tailwind v4 `@theme`; MSW/Vitest/Playwright),
implementing SPEC-G2 (a `/bookmarks` list page: `useBookmarks` TanStack hook over the typed
api-client, `BookmarkList` `'use client'` feature with skeleton/empty states, server-component
page). Graded (no DB): `npm run gate` PASS (typecheck·lint·format·coverage·assert:tests·waivers·
design:drift), `ac:vector` AC-1..4 PASS, 100% coverage, MSW-mocked acceptance + design-token
conformance (AC-4). `reference/{grade.json,README.md,solution/}` emitted; `load-golden` → G1+G2
admitted. Committed `408eefe`.

- **DF-42 does NOT reproduce as a blocker on nextjs:** `src/lib/env.ts` throws (browser context)
  rather than `process.exit(1)`, and the gate/`ac:vector` inject `NEXT_PUBLIC_API_URL` via
  `vitest.config.ts`, so the graded path never needs `.env` (only `dev`/`build`/Playwright do).
  Still worth the infra-setup `.env` fix for the express side (DF-42).
- **DF-43 reproduces** (SPEC-\d+ id resolver ignores `SPEC-G2-frontend`; built under `SPEC-001`).
- **DF-45 (P2, new) — TODO:** `ac:vector` appends an AC-vector block to the active plan's `.md`;
  a subsequent `prettier --check` in the gate then fails on that unformatted block. Benign under
  the canonical `gate → ac:vector` order (`gate:final`), but a *re-gate after grading* fails until
  `prettier --write` runs. Fix: `ac:vector` should write the block pre-formatted, or exclude the
  plan md from the format gate, or gate:final should `prettier --write` the plan after appending.

### G3 (SPEC-G3-fullstack, express api/ + nextjs web/) — BUILT · GRADED GREEN · ADMITTED
The full contract-boundary slice: `api/` exposes `GET /api/v1/bookmarks/count`, its OpenAPI is
exported, `web/` runs `/api-sync` to regenerate `api.generated.ts`, and `BookmarkCountBadge` reads
the count via a typed hook (type imported from the generated contract, renders 0 not blank).
**gate PASS in BOTH apps**; acVector AC-1..4 PASS (AC-1 api jest/g3ref, AC-2/3 web vitest+MSW, AC-4
both gates + contract-drift diff). `load-golden` → **3 admitted, 0 rejected** (AC-5 complete).

- **DF-46 (P2, defect — contract boundary) — TODO:** `.openapi()` on a Zod schema *imported from
  the Types layer* throws `X.openapi is not a function` — `extendZodWithOpenApi(z)` only augments
  schemas created AFTER it runs (inside `openapi.ts`), not ones built in `*.types.ts`. Every
  template path today is description-only, so **G3 is the first product to register a typed
  response component and the first to hit this**; the infra-setup guidance is incomplete. Fix:
  build the response component inside `openapi.ts` and nest the imported schema as a plain child
  (never call `.openapi()` on the import), or call `extendZodWithOpenApi` in the Types layer.
- **DF-47 (P2, footgun — api-sync/AC-4) — TODO:** `/api-sync` copies `openapi.json` verbatim, but
  the web repo's prettier reformats it, so a naive `git diff openapi.json` shows formatting-only
  drift. The byte-stable artifact is `api.generated.ts`. Fix: `/api-sync` should `prettier --write
  openapi.json` after copying (or exclude it from the format gate).
- **DF-48 (P3, footgun) — TODO:** `GET /bookmarks/count` is shadowed by `GET /bookmarks/:id`
  (matched as `id="count"` → 404) unless registered first. Standard Express, but a real trap for
  aggregate sub-paths; the reference declares `/count` before `/:id`.
- **DF-42 stands** (express `env.ts` still `exit(1)` without `.env`); **DF-43 reproduces** (built
  under `SPEC-001`); **DF-45 did not reproduce** (plan `.md` is in `.prettierignore` per DF-15).

**AC-5 DONE:** the golden set now admits all three references (G1 backend · G2 frontend · G3 fullstack).

### Run-6 fix status — golden-build findings
- **DF-42 — FIXED** (express/nestjs/fastapi): `/infra-setup` now creates `.env` from `.env.example`
  idempotently with dev-safe defaults + a generated dev secret. nextjs N/A (browser-context env +
  vitest injects vars).
- **DF-43 — FIXED** (all 4): `ac:vector` now distinguishes "no active plan" (exit 0) from "active
  plan exists but its spec id didn't resolve" (exit 1, clear message) — no more false green; also
  accepts an explicit `SPEC-XXX` arg (mirrors `redgreen:record`). Fixed in `ac-vector` itself so
  the shared resolver / `redgreen:record` are unaffected.
- **DF-45 — FIXED on nextjs** (was mis-assessed as benign): nextjs `gate` runs `prettier --check .`
  over the whole tree and DID read `docs/exec-plans/active/*.md` (DF-15 only ignored `.rigel/`, not
  the plan md). Added `docs/exec-plans/` to nextjs `.prettierignore`. express/nestjs/fastapi have no
  format step that reads `.md` → genuinely benign there.
- **DF-46 — FIXED** (express): `api.md` documents the typed-response-component pattern — build the
  response envelope inside `openapi.ts` (post-`extendZodWithOpenApi`) and nest imported Types-layer
  schemas as plain children; never call `.openapi()` on an import. nestjs/fastapi N/A (different
  OpenAPI mechanism).
- **DF-47 — FIXED** (nextjs): `/api-sync` runs `prettier --write openapi.json` after copying so the
  gate's `format:check` sees no formatting-only drift; notes `api.generated.ts` as the reliable
  up-to-date artifact.
- **DF-48 — FIXED** (express): `api.md` routing note — register literal sub-paths (`/count`) before
  `/:id` or Express matches `id="count"` and 404s.

**All golden-build findings (DF-42..48) resolved.** Total dogfood findings this cycle: **DF-1..DF-48**
(all P0/P1 fixed; P2/P3 fixed or logged with guards).

### Run 7 — Part B AC-6/AC-7 live verification
A live G1 trial (headless `claude -p`, Option B, no API key) scaffolded a fresh express app,
built the feature, and graded **gate PASS + AC-1..4 PASS** — proving the whole `run-trial`
pipeline (scaffold → plant holdout → headless build → gate + ac:vector → `trial-N.json`) end to
end. `golden-nightly.mjs --score-only` then ran loadRun → score → regress → baseline → report
cleanly on the real trial dir (handling the ERRORED case correctly).

- **RT-1 (run-trial budget bug) — CAUGHT LIVE + FIXED.** The first trial billed **44.26M tokens**
  and was falsely marked ERRORED (budget 6M). Root cause: `usageTokens()` summed
  `cache_read_input_tokens`, which accumulate per turn (context × turns) — a normal multi-turn
  build reads tens of millions of *cached* tokens. Fix: budget only on **fresh** tokens
  (input + output + cache_creation); record `totalTokens` + `costUsd` for the record. Unit test
  replays the exact 44M-cache-read scenario. **This is the memory in action — unit tests were
  green; only the real headless build exposed the miscount (verify end-to-end, not just
  components).** A follow-up re-run to confirm the COMPLETE status was torn down mid-build twice
  (headless trials are slow/flaky in this env); the pipeline proof + unit-tested fix stand on
  their own.
