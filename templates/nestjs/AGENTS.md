# AGENTS.md — Navigation Map

Stack: NestJS 11 · Node 22 · TypeScript 5 strict · Sequelize 6 + sequelize-typescript · PostgreSQL · Redis · BullMQ · argon2 · @nestjs/swagger · nestjs-pino

---

## 🗺️ Where Everything Lives

| What you need | Where |
|---|---|
| Layer rules + dependency diagram | `ARCHITECTURE.md` |
| Engineering constitution | `docs/design-docs/core-beliefs.md` |
| Active execution plan | `docs/exec-plans/active/` |
| Completed plans | `docs/exec-plans/completed/` |
| Product specs (draft) | `docs/product-specs/draft/` |
| Product specs (approved) | `docs/product-specs/ready/` |
| Architectural decisions | `docs/design-docs/decisions/` |
| Tech debt | `docs/exec-plans/tech-debt-tracker.md` |
| Domain health grades | `docs/QUALITY_SCORE.md` |
| Plan format | `docs/PLANS.md` |

---

## ⚡ Slash Commands

| Command | What it does |
|---|---|
| `/infra-setup` | Phase 0 — full NestJS scaffold (run once) |
| `/write-spec` | Write product spec → `docs/product-specs/draft/` |
| `/write-plan` | Turn READY spec into execution plan |
| `/build-layer` | Build next unchecked layer + run gate |
| `/validate-layer` | Gate check without building |
| `/push-layer` | Commit + push with conventional message |
| `/layer-check` | Ad-hoc architecture violation scan |
| `/garbage-collect` | End-of-feature cleanup |
| `/doc-garden` | Fix stale documentation |
| `/api-sync` | Export live OpenAPI spec from running server |
| `/load-test` | Run k6 smoke / stress / soak |

---

## 🤖 Agents

| Agent | When |
|---|---|
| `gate-checker` | Auto-called by `/build-layer` — PASS/FAIL per layer |
| `reviewer` | Before opening a PR |
| `arch-validator` | Deep layer compliance scan |
| `db-optimizer` | N+1, missing index, pagination audit |
| `security-auditor` | OWASP review — run before any auth PR |
| `doc-gardener` | Fix stale docs |
| `garbage-collector` | End-of-feature cleanup |

---

## ✅ Non-Negotiable Invariants

- No `console.log` → use `Logger` from `@nestjs/common` or `nestjs-pino`
- No `process.env` → use `ConfigService` injected via NestJS DI
- No `HttpException` in services → use NestJS built-in exceptions (`NotFoundException` etc.)
- No business logic in controllers → delegate to service only
- No `@InjectModel()` in services → inject the repository class, not the model
- Every Sequelize `.toJSON()` result → `ZodSchema.parse()`
- Every list endpoint → cursor-based pagination
- Every `@Column` DTO field → has `@ApiProperty()` decorator
- No file > 400 lines

---

## 🔑 The NestJS Difference

**Auth is opt-out, not opt-in.** Global `JwtAuthGuard` protects all routes. Use `@Public()` to expose a route without auth. Never add auth guards per-route.

**Input validation is automatic.** Global `ValidationPipe` with `whitelist: true` runs `class-validator` on every DTO. No Zod on input.

**Output validation is Zod.** Sequelize `.toJSON()` is not guaranteed — Zod parse it in the repository.

**Swagger is live.** OpenAPI spec auto-generated at `/api/docs-json`. No separate file sync needed.

---

## 🔁 The Flow

```
/write-spec → human marks READY → /write-plan
  → /build-layer (repeats per layer, gate-enforced)
  → /garbage-collect → plan closed
```
