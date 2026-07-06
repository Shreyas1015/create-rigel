# AGENTS.md — Navigation Map

Stack: Node 24 LTS · TypeScript · Express · Sequelize · PostgreSQL · Redis · BullMQ
(versions mostly unpinned — `/infra-setup` installs the latest LTS; Sequelize is pinned to v6
for `sequelize-typescript` compatibility)

> Common tasks: `make help` (wraps the npm scripts) or run them directly — e.g. `npm run gate`.

---

## 🗺️ Where Everything Lives

| What you need                      | Where                                  |
| ---------------------------------- | -------------------------------------- |
| Layer rules + dependency diagram   | `ARCHITECTURE.md`                      |
| Engineering constitution (the WHY) | `docs/design-docs/core-beliefs.md`     |
| Active execution plan              | `docs/exec-plans/active/`              |
| Completed plans (history)          | `docs/exec-plans/completed/`           |
| Product roadmap (epics → specs)    | `docs/product-specs/ROADMAP.md`        |
| Product specs (draft)              | `docs/product-specs/draft/`            |
| Product specs (approved)           | `docs/product-specs/ready/`            |
| Architectural decisions (ADRs)     | `docs/design-docs/decisions/`          |
| Known tech debt                    | `docs/exec-plans/tech-debt-tracker.md` |
| Domain health grades               | `docs/QUALITY_SCORE.md`                |
| Plan format + lifecycle            | `docs/PLANS.md`                        |
| Generated DB schema                | `docs/generated/db-schema.md`          |
| Generated API contract (OpenAPI)   | `docs/generated/openapi.json`          |

---

## ⚡ Slash Commands

| Command            | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| `/infra-setup`     | Phase 0 — full infra scaffold (run once)               |
| `/write-roadmap`   | Brief → ordered, dependency-aware spec roadmap → `docs/product-specs/ROADMAP.md` |
| `/write-spec`      | Write a product spec → `docs/product-specs/draft/`     |
| `/write-plan`      | Turn a READY spec into an execution plan               |
| `/build-layer`     | Build next unchecked layer from active plan + run gate |
| `/validate-layer`  | Run gate check on current layer without building       |
| `/push-layer`      | Commit + push current layer with conventional message  |
| `/layer-check`     | Ad-hoc architecture violation scan                     |
| `/garbage-collect` | End-of-feature cleanup pass                            |
| `/doc-garden`      | Scan + fix stale documentation                         |
| `/db-optimize`     | EXPLAIN ANALYZE workflow for slow queries              |
| `/load-test`       | Run k6 smoke / stress / soak test                      |

---

## 🤖 Agents

| Agent               | When to use                                                  |
| ------------------- | ------------------------------------------------------------ |
| `gate-checker`      | Called automatically by `/build-layer` — PASS/FAIL per layer |
| `spec-writer`       | Use the `/write-spec` skill (invokes this)                   |
| `planner`           | Use the `/write-plan` skill (invokes this)                   |
| `reviewer`          | Before opening a PR — full harness review                    |
| `arch-validator`    | Deep import + layer compliance scan                          |
| `db-optimizer`      | N+1, missing index, pagination audit on repo layer           |
| `security-auditor`  | OWASP Top 10 review — run before any auth/payment PR         |
| `doc-gardener`      | Use the `/doc-garden` skill (invokes this)                   |
| `garbage-collector` | Use the `/garbage-collect` skill (invokes this)              |

---

## ✅ Non-Negotiable Invariants

- No `console.log` → use `logger` from `src/config/logger.ts`
- No `process.env` outside `src/config/env.ts`
- No `as SomeType` on external/DB data → Zod parse only
- No file > 400 lines → split into focused modules
- No cross-layer imports → enforced by `eslint-plugin-boundaries` + `madge` + structural tests
- Every DB query result → `Schema.parse(raw.toJSON())`
- Every list endpoint → cursor-based pagination
- Every protected route → `requireAuth` as first line
- Every owned resource → a cross-user isolation test (`tests/architecture/isolation.test.ts` enforces it)
- Every mutating endpoint → honours `Idempotency-Key` (idempotency middleware)
- Every route → registered in `runtime/openapi.ts`; commit a fresh `npm run openapi:export`
- Every external call → retry + timeout
- Gate green (`npm run gate`) and all tests pass before `/push-layer`

---

## 🔁 The Flow

```
# Whole product (run once at the start):
/write-roadmap  →  human reviews ROADMAP  →  pick the walking-skeleton spec

# Every feature (repeat down the roadmap):
/write-spec (roadmap-guided)  →  human marks READY  →  /write-plan
  →  /build-layer (repeats, gate-enforced)
  →  /garbage-collect  →  plan closed
```
