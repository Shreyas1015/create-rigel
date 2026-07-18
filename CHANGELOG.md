# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Shreyas1015/create-rigel/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Shreyas1015/create-rigel/releases/tag/v0.1.0
