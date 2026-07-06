# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-06

### Added

- Initial release of `rigel` (`create-rigel`).
- Scaffolder CLI (`npm create rigel`) with an interactive stack picker.
- Four templates: `nextjs`, `express`, `nestjs`, `fastapi` — each with a `.claude/`
  workflow (rules, review agents, numbered skill pipeline) and a docs taxonomy.
- Smoke test that scaffolds every template in CI (Node 18/20/22).
- Publish-on-tag GitHub Actions workflow with npm provenance.

[Unreleased]: https://github.com/Shreyas1015/create-rigel/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Shreyas1015/create-rigel/releases/tag/v0.1.0
