# QUICKSTART — Your First 30 Minutes

This is an **agent-first** backend template. You don't write code by hand — you
drive [Claude Code](https://claude.com/claude-code) through a gated, layer-by-layer
flow. This guide gets you from clone to first feature.

---

## What is this template?

A governance skeleton for building Express + TypeScript + Sequelize backends with
Claude Code. It ships with:

- **Rules** (`.claude/rules/`) auto-injected when Claude edits matching files
- **Skills** (`.claude/skills/`) — the `/slash-commands` that drive the workflow
- **Agents** (`.claude/agents/`) — e.g. the `gate-checker` that blocks bad layers
- **Config** (`package.json`, `tsconfig.json`, `jest.config.ts`, `Dockerfile`, …) ready to run
- **Docs** (`docs/`) — specs, plans, ADRs, quality scores

It does **not** ship application code. `/infra-setup` generates `src/` on first run.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 24 LTS | `node -v` |
| npm | 11+ | `npm -v` |
| Docker Desktop | latest | `docker --version` |
| Claude Code | latest | `claude --version` |
| Git | any recent | `git --version` |

Install Claude Code: see https://claude.com/claude-code. Open this folder in your
IDE (the VS Code / JetBrains extension) or run `claude` in the terminal here.

---

## Step 1 — Start the local services

The template includes Postgres + Redis (and an app container) via Docker Compose:

```bash
cp .env.example .env        # then fill in JWT_SECRET and any blanks
docker compose up -d postgres redis
```

## Step 2 — Run infrastructure setup (once)

In Claude Code, run:

```
/infra-setup
```

This installs dependencies (latest LTS — nothing is version-pinned), generates the
full `src/` layer structure, providers, middleware, health checks, and the ADR-000
record, then runs the gate and commits. It refuses to run twice (aborts if `src/` exists).

When it finishes you should be able to:

```bash
npm run dev          # server on http://localhost:3000
curl localhost:3000/health   # → { "ok": true, ... }
npm test             # green
```

## Step 3 — Build your first feature

Planning a whole product first? Run `/write-roadmap` (brief → ordered, dependency-aware specs in
`docs/product-specs/ROADMAP.md`), then author each spec down the list. The flow for **every**
feature is the same:

```
/write-roadmap   → (whole product, optional) brief → ordered, dependency-aware spec roadmap
   ↓  (review the roadmap; build the walking-skeleton spec first, then go down the list)
/write-spec      → describe what you're building (roadmap-guided; saved to docs/product-specs/draft/)
   ↓  (you review the spec and mark it READY)
/write-plan      → turns the spec into a layered execution plan
   ↓
/build-layer     → builds the next unchecked layer, runs the gate, commits
   ↓  (repeat /build-layer until all layers are checked off)
/garbage-collect → end-of-feature cleanup, closes the plan
```

`/build-layer` is the heartbeat: it builds **one layer**, runs the `gate-checker`
agent, auto-fixes failures (up to 3 attempts), commits, and then **waits for you**
before the next layer. You stay in control at every boundary.

---

## What to expect

- **You approve direction, the agent does the typing.** Read each layer summary
  before confirming the next.
- **The gate is non-negotiable.** A layer can't be committed until tsc, eslint,
  madge (circular imports), and the architecture tests pass.
- **Rules enforce themselves.** Try adding a `console.log` in a service — the
  post-write hook warns you and the gate blocks it. Use `logger` instead.
- **Everything is documented.** Non-obvious decisions become ADRs in
  `docs/design-docs/decisions/`.

---

## Where to look next

| You want to… | Read |
|---|---|
| Understand the layers | `ARCHITECTURE.md` |
| Understand the *why* | `docs/design-docs/core-beliefs.md` |
| See all commands | `AGENTS.md` |
| Know the plan format | `docs/PLANS.md` |
| Work as a team | `docs/design-docs/team-workflow.md` |
| Check domain health | `docs/QUALITY_SCORE.md` |

---

## Troubleshooting

- **`/infra-setup` says it's already set up** — `src/` exists. It only runs once per repo.
- **`npm test` fails right after clone** — expected. Tests need `npm install` + the
  source `/infra-setup` generates. Run `/infra-setup` first.
- **DB connection refused** — `docker compose up -d postgres redis` and confirm
  `DATABASE_URL` in `.env` matches the compose credentials.
- **A skill feels stale** — check its `verified:` date in the frontmatter. If it's
  >60 days old, Claude will re-check library versions before following it (see the
  Skill Freshness Check in `.claude/CLAUDE.md`).
- **Load tests** — install k6 (`choco install k6` on Windows, `brew install k6` on
  macOS), start the server, then `npm run load:smoke`. The shipped scripts hit
  `/health` out of the box. In CI, run the **Load Test** workflow manually from the
  Actions tab (it never runs on push/PR). See `/load-test`.
