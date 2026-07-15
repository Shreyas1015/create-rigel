# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Shreyas1015/create-rigel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Shreyas1015/create-rigel/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Shreyas1015/create-rigel/releases/tag/v0.1.0
