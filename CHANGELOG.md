# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.15.0] - 2026-08-08

### Added
- **`/debug` now ends in a regression test, mechanically.** It already forbade guessing, but its
  output was a fixed bug and a written record — nothing stopped the bug returning. A fix without a
  test has a shelf life, and prose in a skill cannot enforce that.
  - New `scripts/debug-regression.mjs` (`debug_regression.py` on FastAPI) with `red` / `green` /
    `check`. The reproduction from Step 3 becomes a failing test, **proven red before the fix** —
    a test written afterwards has never been observed failing, so it may assert nothing at all.
  - `npm run gate` (and `gate.sh`) now fail when a signature that has failed **twice** — exactly
    /debug's own trigger — has no regression test proven red→green, or when that test is deleted.
    A *first* failure owes nothing: demanding a test for every transient failure would be noise,
    and a check that cries wolf gets switched off.
  - `red` refuses a test that already passes, one that fails to load (syntax error, bad import),
    and one containing zero tests. Exit code alone can't tell "assertion failed" from "suite
    wouldn't parse", so it reads the structured report (jest/vitest) or pytest's distinct exit
    codes — otherwise a file of gibberish would count as proof that a bug reproduces.

### Changed
- **`nestjs` is delisted.** It is unmaintained for now, so it no longer appears in the stack picker,
  is rejected by `--template nestjs`, and is undocumented. Its files still **ship** in
  `templates/nestjs` deliberately: `create-rigel update` resolves the template from
  `.rigel/manifest.json`, not from the picker, so anyone already on nestjs keeps a working day-2
  path. Re-listing it in `cli.js`'s `STACKS` is all it takes to bring it back — and a smoke-test
  assertion now fails if that list and the test's list ever drift apart.
- README trimmed back toward a README: the deep mechanics moved out, leaving what the gate enforces
  and how to go beyond one repo.

### Fixed
- `gitHead()` in the shared eval lib leaked git's `fatal: ambiguous argument 'HEAD'` to the terminal
  in a repo with no commits — it recovered fine, but the raw error read as a crash.
- The stack picker's "Enter number (1-4)" prompt was hardcoded; it now derives the range from the
  actual stack list.
- `create-rigel impact` no longer leaks git's `fatal: bad revision 'HEAD'` to the terminal in a repo
  with no commits — it recovered fine, but the raw error read as a crash.
- Removed `npx create-rigel verify` from the README. It never existed; it falls through to the
  scaffolder and would try to create a project named `verify`. The real command is
  `npm run verify:rigel`, inside the project.

## [0.14.0] - 2026-08-07

> Ships **PLAN-011 — blast radius**. The rule: the lens never blocks, the contract gate does.

### Added
- `create-rigel impact` — a blast-radius **lens** (exit code always 0). Joins reverse import
  edges (TS/JS + Python, depth-limited), `knowledge/map/services.json` → `consumedBy`, and the
  owning capability's KPI. Prints its own blind spots — queues, feature flags, string-keyed
  routing, DI, ORM magic — because a report that implies completeness is worse than one that
  admits its edges. File-level, like Bazel `rdeps` and Nx affected.
- An `impact:` declaration block in every `/write-spec`; `/write-plan` refuses a spec without one.
  The spec **declares** intent (the code doesn't exist yet, so nothing can be predicted); the gate
  proves you were honest. Over-declaring is free, under-declaring fails.
- The contract gate cross-checks declaration against reality, and authorizes a deliberate break
  through the existing expiring-exemption pattern, now also requiring `# owner:` (a person) and
  `# consumers:` (who you're breaking it for — this is the permission step).

### Fixed
- **`#` is not a comment in oasdiff.** Every line of an `--err-ignore` file is matched as a
  substring, so the worked example inside the seeded `.oasdiff-ignore` header was a live rule
  suppressing exactly the break it documented. The file now ships with no runnable example, and
  all three backend gates reject a `#` line that looks like an operation. (LSN-0013)
- **An exemption no longer defeats the declaration check.** oasdiff now runs twice — raw for the
  truth, ignored for enforcement — so `breaking: false` plus an exemption still fails.
- **"CI enforces it" is now checked, not claimed.** nestjs ships no `ci.yml`, and nestjs/fastapi
  generate theirs at `/infra-setup`, so neither template could promise it. The gate reads
  `.github/workflows` for a real oasdiff install and fails loud when nothing is enforcing it.
- The gate no longer reports "no breaking API changes" when a break exists and is merely
  authorized, nor "AUTHORIZED" when the authorizing exemption has expired.

## [0.13.0] - 2026-08

### Changed
- **Knowledge anchors are now blocking.** They shipped advisory-by-design for one release; a claim
  nothing enforces decays. Gated by `owner:` so that a glossary distributed company-wide can't
  red-light every consumer repo — you are only blocked on the anchors your repo owns.

## [0.12.0] - 2026-08

### Added
- **PLAN-010 — the contract gate.** Three checks: spec freshness (blocking, first — a stale
  contract makes everything below it a lie), `oasdiff` breaking changes against `origin/main`, and
  exemption expiry. Git history is the contract registry, so there is no broker and no cross-repo
  CI. Escape hatches in order of preference: `x-stability-level: draft` → `deprecated` + `x-sunset`
  → an expiring `.oasdiff-ignore` line. Never a PR label — a skipped required check is a silently
  disabled gate.
- `/postmortem` — after an incident, name what broke and which check would have caught it.
- `nextjs` gets `contract:freshness` instead: it consumes a contract rather than publishing one, so
  a breaking-change gate there would verify nothing.

## [0.11.0] - 2026-08

### Added
- **PLAN-009 — the company knowledge layer.** `knowledge/` carries business capabilities (with KPI
  and owner), a domain glossary, and bounded contexts. Anchored to code so the facts can be checked
  rather than trusted.
- The **service map** (`knowledge/map/`) — a facts-up / index-down build: each repo declares what it
  provides and consumes, and the map is derived. `create-rigel facts` and `create-rigel map` read it.

## [0.10.0] - 2026-07

### Added
- **PLAN-008 — the day-2 loop.** A provenance manifest (`.rigel/manifest.json`) records the sha256
  of exactly what Rigel wrote, which makes two things possible: `verify:rigel` (is the output still
  intact?) and `create-rigel update` — a **three-hash** merge (original / current / incoming) that
  updates untouched files silently and leaves your edits alone. No patch reconstruction, no `.rej`.
- **Company layers** — shared rules, seeds, and knowledge pinned by SHA via git, so every repo in an
  org inherits the same standards.

## [0.9.0] - 2026-07

### Added
- `/debug` — a hypothesis-driven loop that terminates in a regression test rather than a guess.
- `STATE.md` — an ephemeral "where the last session stopped" hint. The plan always wins if they disagree.
- The **promotion gate**: a lesson marked `ENFORCED` must name the check enforcing it, and that
  check must exist. Stale-curation sweeps lessons that never got promoted.

## [0.8.1] - 2026-07

### Fixed
- Strip generated artifacts from the published package (LSN-0008). The path-scoped ignore negations
  stopped covering newly added directories; the rule was sharpened to be pattern-scoped.

## [0.8.0] - 2026-07

### Added
- **PLAN-007 — memory and self-improvement.** Lessons live one-per-file on a five-stage ladder
  (OBSERVED → INVESTIGATED → VERIFIED → DISTILLED → ENFORCED). Promotion is manual and terminates in
  a *mechanical check*, after which the prose is deleted. Memory is a staging area for gate rules,
  not a library of advice.

## [0.7.1] - 2026-07

### Fixed
- PLAN-006 close-out: dogfood findings DF-1..48 plus the golden trials.

## [0.7.0] - 2026-07-20

> Ships PLAN-005 — the **design enforcement stack** for the `nextjs` template (the only one
> with a rendered UI; backends intentionally get none of it). Buy-over-build: trusted, maintained
> packages own each rule class; Rigel builds only the glue and the checks nobody ships. Verified
> end-to-end with a real `create-next-app` + `/infra-setup` run on Next 16 + Tailwind v4.

### Added

- **Design tokens as the source of truth (AC-1).** `tokens.json` in DTCG format (primitive +
  semantic tiers; components reference only semantics). Style Dictionary builds it into
  `src/app/tokens.css` as a Tailwind v4 `@theme` block, imported into `globals.css`. Editing a
  token and running `npm run tokens:build` changes rendered output.
- **Token discipline in the lint gate (AC-2).** `eslint-plugin-tailwindcss` v4 enforces
  `no-arbitrary-value`, `no-custom-classname`, and `no-contradicting-classname` as errors on the
  render layers (arbitrary values like `bg-[#ff0000]` fail the gate).
- **Impeccable design-quality detector (AC-3).** Chained into `post-write.sh` after Rigel's own
  blockers (architecture beats aesthetics). A Rigel-owned severity map
  (`.claude/hooks/impeccable-severity.json`) blocks AI-slop antipatterns (exit 2) and treats
  craft findings as advisory.
- **Waiver governance (AC-4).** `scripts/check-waivers.mjs` (in the gate) fails any
  `impeccable-disable` marker that lacks a reason; the count is reported in QUALITY_SCORE.md.
- **DESIGN.md ownership split + drift guard (AC-5).** `DESIGN.md` now holds brand *meaning* and
  references `tokens.json` for values; `scripts/check-design-drift.mjs` fails if a literal value
  leaks into `DESIGN.md`.
- **Optional Figma connector docs (AC-8).** `docs/design-workflow.md` documents the Figma Dev
  Mode MCP import/export paths with the explicit boundary that `tokens.json` in the repo — never
  Figma — is authoritative.
- **ADR-001 / ADR-002** recording the Style Dictionary choice and (critically) why the Impeccable
  severity map lives in a Rigel-owned file, not `.impeccable/config.json` (which the tool rewrites).

### Changed

- **Design-token conformance now reads `tokens.json` (AC-6).** The PLAN-003 rendered-conformance
  check reads its allowed values from `tokens.json` (resolving DTCG aliases, dropping primitives)
  instead of a DESIGN.md token block — one source of truth.
- **vision-judge scope-reduction recorded (AC-7).** `evals/config/judge-config.json` now records
  the dimensions dropped from the advisory judge and the deterministic layer that replaced each
  (token adherence → conformance + eslint; slop → Impeccable).

## [0.6.0] - 2026-07-19

> Ships the template-facing half of PLAN-004: the **advisory judges** (safe, log-only, never
> block). The golden-set harness that calibrates/regresses them lives in `evals/` and is
> intentionally **not published** (repo-internal); its reference solutions + live runner are
> deferred. So this release adds a coherent advisory feature to scaffolded projects without
> shipping anything half-built.

### Added

- **Judges + golden-set harness (PLAN-004, Phase 1 part 2) — machinery.** The judgment-shaped
  remainder PLAN-003's deterministic checks can't cover. Everything ships **advisory**; nothing
  blocks until mechanically calibrated.
  - **Advisory spec-conformance judge** (`spec-judge` agent, all templates) — reads only the
    spec + diff (never the transcript), emits per-AC + intent + abstraction verdicts
    (PASS/FAIL/UNKNOWN) into the plan log, routing UNKNOWN to `.rigel/judge-review-queue/`.
    Wired into `/garbage-collect` as a log-only step. New `judge` role (opus) in
    `model-routing.json`.
  - **Advisory vision judge** (`vision-judge` agent, nextjs) — layout sanity only (hierarchy /
    spacing-sanity / state-completeness); token adherence stays the deterministic AC-6 check.
    Screenshot capture via `tests/design/capture-screens.spec.ts`.
  - **Golden-set harness** in `evals/` (repo-level, unpublished, zero-dep): three frozen golden
    specs; a "no green reference, no entry" loader; per-check trial scoring with pass^k and
    ERRORED≠FAILED; regression detection (fail ≥2/3 AND baseline-passed, with the METR
    "human reads the transcript" rule); champion/challenger via a two-sided sign-flip test;
    a calibration harness with the deterministic-overlap bootstrap and per-dimension κ; and the
    grader cost-down (opus-vs-cheaper) parity experiment.
  - **Mechanical promotion gate** (`promotion-check.mjs`, in `repo-integrity.yml`): a judge
    dimension may go blocking only by citing a fresh (≤90-day), threshold-meeting calibration
    report — CI refuses otherwise. The judge model is pinned (documented exception to no-pins).
  - Solo-maintainer honest by construction: with one labeler, human-vs-human κ isn't
    established, so judge-exclusive dimensions stay reduced-confidence and advisory rather than
    inventing a κ; only deterministic-overlap dimensions can be promoted.

### Note

- Deferred to a later pass (infra/API-heavy): the golden **reference solutions**, the live
  **`run-trial.mjs`** runner (headless agent execution + `ANTHROPIC_API_KEY`), and the golden
  nightly workflow. All deterministic harness logic is complete and tested on fixtures
  (`npm run test:evals`).

## [0.5.0] - 2026-07-18

### Added

- **Deterministic evals (PLAN-003, Phase 1) across all four templates.** Closes the
  spec→evidence loop with mechanically-enforced, LLM-free checks. No agent can claim an
  acceptance criterion by self-report; it must produce a test that was proven red, is
  non-vacuous, and passes.
  - **AC-ID traceability + per-AC vector.** Specs now write stable `AC-N` ids; every id must
    map to an acceptance test whose title carries it. `scripts/ac-vector.*` grades the outcome
    at feature completion (`PASS` / `FAIL` / `MISSING` / `INVALID`) into the plan's progress log.
  - **Holdout enforcement.** `tests/acceptance/` is a fail-closed holdout: the post-write hook
    blocks edits there (exit 2) unless `/write-spec` has set `.rigel/acceptance.unlock`, backed
    by a CODEOWNERS lead-review line.
  - **Spec-phase scaffolding + red-green proof.** `/write-spec` scaffolds one failing acceptance
    test per AC; `scripts/redgreen-record.*` requires every one to fail pre-implementation
    (recorded to `.rigel/redgreen/`), and `/write-plan` refuses specs lacking tests + proof.
  - **Assertion integrity.** An AST check (TS compiler API for TS templates, `ast` for fastapi)
    fails any AC-claiming test with zero/trivial/snapshot-only assertions.
  - **Design-token conformance (nextjs).** A deterministic Playwright check diffs rendered
    computed styles against a `DESIGN.md` token list; per-dimension, opt-in enforcement.
  - **Mutation audit (nightly alarm).** Stryker (TS) / mutmut (fastapi) run nightly on the
    acceptance holdout and open an issue below the 60% floor — never a merge gate.
  - Per-gate cost stays flat: only the *static* traceability + assertion-integrity checks run
    in the per-layer gate; the green vector runs at feature completion.

### Fixed

- **express jest never ran in a clean environment.** The `ts-jest` ESM preset requires
  `NODE_OPTIONS=--experimental-vm-modules`, which no script/CI set — so `npm test`, `npm run
  gate`, and CI silently reported "0 tests". Added the flag to the jest scripts.
- **nestjs post-write hook never saw the edited path** (read only top-level `file_path`, not
  the nested `tool_input.file_path` Claude Code sends), and the express/fastapi/nestjs hooks
  could crash under `set -u` with no warnings. Both fixed.

## [0.4.0] - 2026-07-18

### Changed

- **Reworked the branch model to keep `main` the source of truth with isolated feature
  promotion.** Replaces the previous `feature → staging → main` promotion flow. Every
  template's `.rigel/git-policy.json` (and the hooks, skills, CI, and docs that read it) now
  encodes:
  - Feature branches are **cut from and rebased on `main`** (never on `staging`/`drop`), so a
    feature promotes to `main` carrying only its own changes.
  - A new disposable **`drop`** deploy-trigger branch: merging a feature into `drop` deploys it
    to the stage server for testing. `drop` never merges upward and is intentionally unprotected.
  - **Two promotion paths onto `main`:** *urgent* (`feature → main`, to ship one verified
    feature immediately, isolated from staging's other in-flight work — gated on a full CI pass
    plus a documented canary/smoke) and *batch* (`staging → main`, to promote the whole verified
    stage release). `staging` mirrors the last validated stage state.
  - `/sync-branch` now rebases onto `main`; `/open-pr` chooses base + merge method for the
    deploy/urgent/batch/hotfix flows; `pre-push` and the git-policy CI recognize `drop`;
    `docs/git-workflow.md` documents the model, one-time `drop`+`staging` setup, and the
    "test ≠ ship" caveat on the urgent path.

  The deploy pipeline that advances `staging` after stage tests pass is intentionally left for
  the consuming project to wire (it's environment-specific).

### Added

- **Template-level git workflow enforcement.** Every scaffolded project now inherits an
  enforced (not remembered) git workflow, driven by a single source of truth:
  - `.rigel/git-policy.json` — the branch model (`main` + `staging`), branch-name and
    Conventional-Commit patterns, and per-branch merge strategy + protection. Byte-identical
    across all four templates; every hook, skill, script, and CI job reads from it.
  - `.githooks/commit-msg` + `.githooks/pre-push` — toolchain-free POSIX-shell hooks
    (no husky, no node/python needed) that reject non-Conventional-Commit messages and
    off-pattern branch names locally. Identical across every template; activated at
    `/infra-setup` via `git config core.hooksPath .githooks`. A stack-specific
    `.githooks/pre-commit` runs each template's own linters.
  - `/sync-branch` and `/open-pr` skills — rebase-onto-base + re-gate, and PR creation with
    base/merge-method chosen from the policy and the body auto-filled from the active PLAN.
  - `scripts/protect-branch.sh` (applies `main` + `staging` protection via `gh api`) and
    `scripts/check-protection-drift.sh` (fails CI if live protection drifts from the policy).
  - `.github/workflows/git-policy.yml` — enforces branch name, Conventional Commits over the
    PR range, a required PLAN reference, and protection drift on every PR.
  - `.github/CODEOWNERS` (added for the nestjs and fastapi templates) and
    `docs/git-workflow.md` documenting the branch model and one-time protection setup.

### Changed

- Templates activate git hooks via `git config core.hooksPath .githooks` instead of husky.
  Removed the nextjs template's `.husky/` directory and its `prepare: husky` script; the
  fastapi template drives its existing `pre-commit` toolchain from `.githooks/pre-commit`
  rather than `pre-commit install`. Each template's `/infra-setup` was rewired accordingly.

## [0.3.0] - 2026-07-18

### Added

- **An enforced (not remembered) git workflow inside every template.** One source of truth per
  project — `.rigel/git-policy.json`, byte-identical across all four templates — encodes the branch
  model, branch-name and Conventional-Commit patterns, and per-branch merge strategy. Every hook,
  skill, script, and CI job reads from it rather than restating it.
- **Toolchain-free local enforcement:** `.githooks/commit-msg` and `.githooks/pre-push` are POSIX
  shell (no husky, no Node or Python required), so the policy holds before dependencies are
  installed. Activated at `/infra-setup` via `git config core.hooksPath .githooks`; a
  stack-specific `.githooks/pre-commit` runs each template's own linters.

## [0.2.0] - 2026-07-15

### Added

- `model-routing.json` — a single source of truth mapping agent roles
  (`orchestrator` / `worker` / `grader`) to models. Every template agent's `model:`
  frontmatter is generated from and CI-checked against it, and the file is stamped into
  each scaffolded project so runtime role routing has a policy to read.
- `/build-layer` role escalation: after two failed gate attempts on the same layer, the
  build escalates from the `worker` role to the `orchestrator` role and appends a
  structured, greppable lesson record to `docs/exec-plans/lessons.log`.
- `scripts/check-model-routing.js` — checks (or, with `--write`, regenerates) agent
  frontmatter against `model-routing.json`.
- `repo-integrity` CI workflow: fails the build on leaked absolute paths in a shipped
  `settings.json`, on model-routing drift, or on leftover legacy brand identifiers.

### Changed

- Normalized every template's agent models onto the shared role table: enforcement
  agents (`gate-checker`, `reviewer`, `security-auditor`, `contract-checker`) and
  `arch-validator` run on `opus`; workers (`db-optimizer`, `doc-gardener`,
  `garbage-collector`, `perf-auditor`) run on `sonnet`. This replaces the previous
  per-template model pins that disagreed with each other.
- Normalized the `nestjs` template's default session model to match the other templates.

### Fixed

- Completed the `create-harness` → `create-rigel` rename across the CLI banner, smoke-test
  temp-directory prefix, contributing guide, issue template, and the `express` template's
  package name, description, keywords, and gitleaks config title.

### Security

- Removed absolute local filesystem paths accidentally included in the `fastapi` template's
  `.claude/settings.json` (both `permissions.allow` entries and the `additionalDirectories`
  list). Scaffolded fastapi projects no longer reference the maintainer's local machine.

## [0.1.0] - 2026-07-06

### Added

- Initial release of `rigel` (`create-rigel`).
- Scaffolder CLI (`npm create rigel`) with an interactive stack picker.
- Four templates: `nextjs`, `express`, `nestjs`, `fastapi` — each with a `.claude/`
  workflow (rules, review agents, numbered skill pipeline) and a docs taxonomy.
- Smoke test that scaffolds every template in CI (Node 18/20/22).
- Publish-on-tag GitHub Actions workflow with npm provenance.

[Unreleased]: https://github.com/Shreyas1015/create-rigel/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Shreyas1015/create-rigel/releases/tag/v0.1.0
