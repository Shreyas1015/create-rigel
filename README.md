<div align="center">

# ✦ rigel

**Harness the power of AI coding agents into shipped, gated software.**

Scaffold an agent-first, gate-enforced starter project — Next.js · Express · FastAPI — each wired for [Claude Code](https://docs.claude.com/en/docs/claude-code) with a mechanical quality gate, path-scoped rules, specialist review agents, and a spec-driven workflow baked in.

[![npm version](https://img.shields.io/npm/v/create-rigel.svg?logo=npm&color=cb3837)](https://www.npmjs.com/package/create-rigel)
[![npm downloads](https://img.shields.io/npm/dm/create-rigel.svg)](https://www.npmjs.com/package/create-rigel)
[![CI](https://github.com/Shreyas1015/create-rigel/actions/workflows/ci.yml/badge.svg)](https://github.com/Shreyas1015/create-rigel/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/npm/l/create-rigel.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/create-rigel.svg?logo=node.js)](https://nodejs.org)

</div>

```bash
npm create rigel@latest my-app
```

> **rigel** — named for the *rig* that harnesses raw power, and for [Rigel](https://en.wikipedia.org/wiki/Rigel), one of the brightest stars in the sky. It rigs your project with guardrails so a powerful agent builds like a pro.

---

## Table of contents

- [Why rigel?](#why-rigel)
- [What you get](#what-you-get)
- [Quick start](#quick-start)
- [Templates](#templates)
- [Inside a scaffolded project](#inside-a-scaffolded-project)
- [The workflow it enables](#the-workflow-it-enables)
- [What the gate actually enforces](#what-the-gate-actually-enforces)
- [Beyond one repo](#beyond-one-repo)
- [Requirements](#requirements)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Versioning](#versioning)
- [License](#license)

## Why rigel?

Coding agents are great at *writing* code and bad at *stopping themselves from drifting*. Point one at an empty repo and you get inconsistent structure, untested code, and "looks done" claims that don't hold up. The fix isn't a better prompt — it's a **repo that constrains the agent**: written rules it must follow, a fixed build order, and a gate that blocks the commit when the code is wrong.

`rigel` scaffolds exactly that repo. Every template ships an opinionated architecture plus a `.claude/` workflow so that, from the first commit, an AI agent (or a human) builds through a **spec → plan → layered build → mechanical gate** loop instead of freewheeling. Quality is enforced by checks that fail the build, not by hoping someone remembers the standard.

**In one line:** it's `create-next-app` for teams who build *with* AI agents and want the guardrails in the repo, not in their heads.

## What you get

- 🧱 **Opinionated, layered architecture** per stack — a strict import matrix (types → config → models → repo → service → runtime → …) that keeps business logic testable and isolated.
- ✅ **A mechanical gate** — `typecheck + lint (zero warnings) + circular-dep check + architecture tests + coverage thresholds` that must pass before every commit. Encode a rule or drop it.
- 🤖 **A `.claude/` workflow** — path-scoped rules, a numbered skill pipeline, and specialist review agents (reviewer, security-auditor, arch-validator, db-optimizer, …) that run automatically.
- 📐 **Spec-driven delivery** — a `docs/` taxonomy (product-specs → exec-plans → design-docs/ADRs) so intent lives in the repo and drives the build.
- 🔒 **Security & correctness defaults** — validate-at-the-boundary, OWASP handler ordering, a mandatory cross-user isolation test (404, not 403), and a pre-write hook that blocks secrets and edits to generated contracts.
- 🚦 **CI-ready** — pre-commit hooks and CI workflows so the gate runs on every push, not just locally.
- 🧪 **Proof instead of claims** — acceptance tests must be proven *red* before a spec can be planned, and a runner that executes zero tests fails the gate instead of reporting green.
- 📜 **A contract gate** — `oasdiff` catches breaking API changes; a deliberate break needs a named owner, an expiry, and the consumers you're breaking it for.
- 🔄 **A day-2 story** — a provenance manifest lets `create-rigel update` pull template improvements into an existing repo without clobbering your edits.

## Quick start

```bash
# interactive — prompts you to pick a stack
npm create rigel@latest my-app

# or choose the stack up front
npm create rigel@latest my-app -- --template nextjs

# scaffold into the current directory
npm create rigel@latest .
```

Using another package manager? All of these work:

```bash
pnpm create rigel my-app
yarn  create rigel my-app
bun   create rigel my-app
```

> **Note:** with npm 7+, flags after the project name need the extra `--` (as shown above).

## Templates

| Template | Stack | Best for |
|----------|-------|----------|
| **`nextjs`** | Next.js + React + TypeScript + Tailwind, TanStack Query, typed API client | Frontends that consume a typed API contract |
| **`express`** | Express + TypeScript + Sequelize (Postgres) + BullMQ + OpenTelemetry | Backends / REST APIs with jobs and observability |
| **`fastapi`** | FastAPI + Python (uv) + SQLAlchemy + ruff/mypy/bandit | Python backends / data services |

Pick interactively, or pass `--template <name>`.

## Inside a scaffolded project

Every template lays down the same shape (adapted per stack):

```text
my-app/
├── .claude/
│   ├── rules/          # path-scoped rules auto-injected as the agent edits (architecture, api, security, testing, …)
│   ├── agents/         # specialist reviewers: gate-checker, reviewer, security-auditor, arch-validator, db-optimizer …
│   ├── skills/         # the numbered pipeline: 00-infra-setup → 01-write-roadmap → … → build-layer → garbage-collect
│   ├── hooks/          # a post-write hook that warns/blocks (secrets, edits to generated contracts, oversized files)
│   └── CLAUDE.md       # standing instructions the agent reads every session
├── docs/
│   ├── product-specs/  # ROADMAP + one spec per feature (draft → ready)
│   ├── exec-plans/     # layered execution plans (active → completed) + tech-debt tracker
│   └── design-docs/    # core-beliefs (the constitution), ADRs (decisions/), lessons/ (the memory ladder)
├── knowledge/          # business capabilities, domain glossary + contexts, and the company service map
├── scripts/            # the enforcement scripts: gate steps, contract gate, red-green recorder, curate-scan
├── .rigel/
│   ├── manifest.json   # provenance — the sha256 of exactly what Rigel wrote (powers verify + update)
│   └── git-policy.json # protected trunk + branch-name policy, read by the committed git hooks
├── ARCHITECTURE.md     # the layer diagram + import matrix
├── AGENTS.md           # navigation map + non-negotiable invariants
└── src/                # generated on first run by /infra-setup
```

The **gate** (`npm run gate` / `scripts/gate.sh`) is the enforcement core: type-clean, lint-clean (zero warnings), no circular deps, no cross-layer imports, no files over the size limit, coverage above per-layer thresholds, and the cross-user isolation test present. It runs after every build layer and in CI.

## The workflow it enables

After scaffolding, open the project in Claude Code and drive the pipeline:

```text
/infra-setup      # generates src/ and installs dependencies (run once)
/write-roadmap    # decompose the product into an ordered set of feature specs
/write-spec       # write ONE feature spec — you review it and mark it READY
/write-plan       # derive a layered, checkboxed execution plan from the spec
/build-layer      # build ONE layer → gate → auto-fix (max 3) → commit → you confirm → next
/validate-layer   # run the gate on demand
/open-pr          # land the feature branch on the protected trunk
/garbage-collect  # end-of-feature cleanup + quality score update
```

And when things go wrong, or you learn something:

```text
/debug            # a hypothesis-driven loop that ends in a regression test, not a guess
/curate           # turn a repeated gate failure into a written lesson
/postmortem       # after an incident: what broke, and which check would have caught it
```

The agent does the typing; **you own the specs and the merges**; the gate catches mistakes mechanically. You review *decisions*, not lint errors.

## What the gate actually enforces

Beyond typecheck and lint, each scaffolded repo ships checks that fail the build:

| Check | What it stops |
|---|---|
| **Red-green proof** | A spec can't be planned until its acceptance tests exist *and* have been proven red. A test that never failed proves nothing. |
| **`assert:tests`** | A test runner that exits 0 having run **zero** tests. A false green is worse than a red. |
| **Contract gate** | Breaking API changes, via `oasdiff` against `origin/main`. Git history is the contract registry — no broker, no cross-repo CI. |
| **Lesson promotion** | A lesson marked `ENFORCED` that doesn't name a real, existing check. |
| **Knowledge anchors** | Documented facts that no longer match the code they point at. |

Two ideas run through all of it:

> **If it can't fail a build or drive a mechanical loop, it's a doc, not an agent.**
> **Gate strength scales with blast radius.**

Lessons live in `docs/design-docs/lessons/` on a ladder — `OBSERVED → INVESTIGATED → VERIFIED →
DISTILLED → ENFORCED` — and a lesson is only *finished* when it becomes a mechanical check and the
prose is deleted. Memory is a staging area for gate rules, not a library of advice.

## Beyond one repo

```bash
npx create-rigel impact    # what does my change touch — here and across services?
npx create-rigel facts     # what this service provides, consumes, and runs on
npx create-rigel map       # the company service map
npx create-rigel update    # pull template improvements into an existing repo
```

`impact` joins the in-repo import graph with the company service map and the owning business
capability, so you can see what a change reaches without cloning other repos. It prints what it
*can't* see too — queues, feature flags, string-keyed routing — and **always exits 0**. It informs;
the contract gate is what blocks.

`update` is a three-hash merge (original / current / incoming) against the provenance manifest
Rigel wrote at scaffold time: untouched files update silently, your edits are left alone and
reported. No patch reconstruction, no `.rej` files. Teams can pin a shared company layer of rules
and knowledge by SHA — see [`docs/company-level.md`](./docs/company-level.md).

## Requirements

- **Node.js ≥ 18** to run the scaffolder itself.
- Individual templates may need more:
  - `nextjs` / `express` — Node (see each template's `.nvmrc`), a package manager.
  - `express` also expects Postgres + Redis for local dev (Docker Compose included).
  - `fastapi` — Python 3.11+ and [`uv`](https://github.com/astral-sh/uv).

## FAQ

**Do I have to use Claude Code?** No — the templates are normal, runnable projects. The `.claude/` workflow is a bonus that makes AI-assisted development disciplined; the gate and architecture stand on their own.

**Why is FastAPI (Python) shipped from an npm package?** The scaffolder only *copies files* — it's language-agnostic. npm is just the delivery mechanism, the same way `create-*` tools scaffold non-JS projects.

**Can I add my own template?** Yes — see [CONTRIBUTING.md](./CONTRIBUTING.md). Templates live in [`templates/`](./templates); add a folder and register it in `cli.js`.

**Does it modify anything outside the target folder?** No. It creates the project directory (refusing to overwrite a non-empty one) and nothing else.

## Contributing

Templates are the source of truth and live in [`templates/`](./templates). See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to run, test (`npm test` scaffolds every template), and add a stack. Bugs and ideas → [issues](https://github.com/Shreyas1015/create-rigel/issues).

## Versioning

This project follows [Semantic Versioning](https://semver.org). See the [CHANGELOG](./CHANGELOG.md) for release notes.

## License

[MIT](./LICENSE)
