# ARCHITECTURE.md — Layered Architecture

Stack: TypeScript 5 · Express 5 · Sequelize 6 · PostgreSQL · Redis · BullMQ

---

## Dependency Layer Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Utils  — stateless helpers, zero domain imports        │
│           100% test coverage required                    │
└────────────────────┬────────────────────────────────────┘
                     │ (imported by all layers below)
┌────────────────────▼────────────────────────────────────┐
│                                                          │
│  Types ──► Config ──► Models ──► Repo                   │
│                                    │                     │
│                                    ▼                     │
│                                 Service                  │
│                                    │                     │
│                                    ▼                     │
│                    Runtime { Routes · Workers }          │
│                                                          │
│  Providers (auth, telemetry SDK, redis)                  │
│  └─ wired in by Runtime (composition root) only          │
│                                                          │
│  Config also hosts cross-cutting helpers every layer     │
│  needs: logger, tracing (withSpan), metrics              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Layer Definitions

### Types (`src/types/`)
- Pure TypeScript interfaces, enums, type aliases, Zod schemas
- **Zero imports** from any other layer
- **Zero runtime code** — no function bodies with logic
- Examples: `Application`, `ApplicationStage`, `CreateApplicationInput`, `PageResult<T>`

### Config (`src/config/`)
- Env vars (Zod-validated), constants, timeouts
- Cross-cutting helpers every layer may import: `logger` (pino), `withSpan` (tracing), `metrics`
  — these use only the `@opentelemetry/api` global, so they are safe no-ops when the SDK is off
- Imports: **Types only** (plus third-party: `zod`, `pino`, `@opentelemetry/api`)
- `env.ts` calls `process.exit(1)` on invalid config — fail fast
- Examples: `env.ts`, `constants.ts`, `timeouts.ts`, `database.ts`, `logger.ts`, `tracing.ts`, `metrics.ts`

### Models (`src/models/`)
- Sequelize model class definitions — schema only, no logic
- Imports: **Types, Config**
- All models: `paranoid: true`, `@Default(() => newId())`, indexes defined
- Examples: `User.model.ts`, `Application.model.ts`

### Repo (`src/repo/`)
- DB access only. All external data validated with Zod.
- Imports: **Types, Config, Models**
- **Every** query result: `Schema.parse(raw.toJSON())`
- All list methods: cursor-based pagination (cursors encoded with **base64url**)
- Ownership enforced: `findByIdAndUser(id, userId)` — never `findById` alone
- **Cross-user isolation**: a resource owned by user A must be invisible to user B.
  When B requests A's resource, the repo returns nothing and the route responds
  **404** (never 403 — do not reveal that the resource exists). **Enforced**: every
  ownership-scoped repo must ship `tests/integration/<resource>.isolation.test.ts`
  (copy `isolation.test.template.ts`); `tests/architecture/isolation.test.ts` fails
  CI if one is missing.
- Examples: `user.repo.ts`, `application.repo.ts`

### Service (`src/services/`)
- Business logic and use-case orchestration
- Imports: **Types, Config, Repo**
- **No** `Request`, `Response`, `HttpException`, `express` imports
- **No** inline HTTP calls — external APIs go via Repo
- Examples: `application.service.ts`, `auth.service.ts`

### Runtime (`src/runtime/`)
- HTTP handlers, job workers, CLI entry points
- Imports: **Types, Config, Repo, Service**
- Routes: auth → validate → service → respond (this order, every time)
- Thin layer — zero business logic, delegates everything to Service
- **Canonical response envelope** (see `.claude/rules/api.md` for full spec):
  - Success: `{ ok: true, data, meta: { requestId, timestamp } }` via the `ok()` helper
  - Error: `{ ok: false, error: { code, message }, meta: { requestId } }` via `errorHandler`
  - `error.code` ∈ `VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | FORBIDDEN | CONFLICT | RATE_LIMITED | INTERNAL_ERROR`
- Mutating routes accept an `Idempotency-Key` header via `middleware/idempotency.ts` (Redis-backed replay)
- The OpenAPI registry lives in `runtime/openapi.ts`; routes register their schemas + paths there
- Examples: `routes/v1/applications.route.ts`, `middleware/idempotency.ts`, `workers/reminder.worker.ts`

### Providers (`src/providers/`)
- Stateful cross-cutting singletons: auth, redis, the OpenTelemetry `NodeSDK`, feature flags
- Wired in by **Runtime** (the composition root) — never imported by Service/Repo/Models
- `telemetry.ts` is **boot-only**: it owns the `NodeSDK` and is the *only* file that imports it.
  The reusable `withSpan`/`metrics`/`logger` helpers live in **Config** (the api-global, no SDK)
  so that Service and Repo can stay clean without importing this layer.
- Examples: `redis.ts`, `auth/jwt.ts`, `telemetry.ts`, `featureFlags.ts`

### Utils (`src/utils/`)
- Stateless helpers — **type-only imports from Types allowed** (e.g. the response-envelope types in `response.util.ts`); zero other domain imports
- **100% test coverage** required — enforced in CI
- Examples: `retry.ts`, `circuitBreaker.ts`, `mapWithConcurrency.ts`, `uuid.ts`

---

## Allowed Imports (strict — linter enforces)

```
Types   →  (nothing)
Config  →  Types
Models  →  Types, Config
Repo    →  Types, Config, Models
Service →  Types, Config, Repo
Runtime →  Types, Config, Repo, Service
Utils   →  Types (type-only)
Providers → nothing from domain (domain imports Providers, not reverse)
```

**Forbidden:**
- Service importing from Runtime or Providers — *blocked by ESLint* (`boundaries/dependencies`)
- Utils importing from any domain layer other than type-only Types — *blocked by ESLint* (`boundaries/dependencies`)
- Circular imports of any kind — *blocked by `madge --circular`* (`npm run check:circular`)
- Repo containing business logic (if/else beyond null checks) — *checked by gate-checker + review*
  (no linter can express this rule; it is a judgment check, not a mechanical one)

---

## File Size Limit
- **400 lines maximum** per file
- Approaching limit → split into focused sub-modules
- Enforced by: PostToolUse hook + gate-checker agent

---

## Naming Conventions

| Layer | File pattern | Example |
|---|---|---|
| Types | `*.types.ts` | `application.types.ts` |
| Config | `*.ts` in `config/` | `env.ts`, `timeouts.ts` |
| Models | `*.model.ts` | `Application.model.ts` |
| Repo | `*.repo.ts` | `application.repo.ts` |
| Service | `*.service.ts` | `application.service.ts` |
| Route | `*.route.ts` | `applications.route.ts` |
| Worker | `*.worker.ts` | `reminder.worker.ts` |
| Utils | `*.util.ts` | `retry.util.ts` |
| Zod schemas | `*Schema` | `ApplicationSchema` |

---

## Mechanical Enforcement Stack

1. **ESLint** (`eslint.config.mjs`) — `boundaries/dependencies` (eslint-plugin-boundaries v6, with the TypeScript import resolver) blocks cross-layer imports;
   `no-restricted-syntax` blocks `process.env` outside `config/env.ts`; plus `no-console`,
   `no-explicit-any`, `no-unsafe-assignment`, `no-floating-promises`.
2. **madge** — `npm run check:circular` blocks circular imports (ESLint does not do this).
3. **Structural tests** — `tests/architecture/layers.test.ts` — a second, independent layer check; fails CI.
4. **PostToolUse hook** — `.claude/hooks/post-write.sh` warns on write (size, console.log, process.env, unsafe cast).
5. **gate / gate-checker** — `npm run gate` (humans + CI) and the `gate-checker` agent (called by `/build-layer`);
   PASS required before commit.
