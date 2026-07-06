---
name: 00-infra-setup
description: /infra-setup — Phase 0 Infrastructure Setup
verified: 2026-06-19
libraries: [express, sequelize, sequelize-typescript, pg, zod, pino, jose, argon2, bullmq, ioredis, helmet, cors, express-rate-limit, "@asteasolutions/zod-to-openapi", "eslint-plugin-boundaries", "@opentelemetry/sdk-node", "@opentelemetry/auto-instrumentations-node", "@opentelemetry/exporter-trace-otlp-http", "@opentelemetry/exporter-metrics-otlp-http", "@opentelemetry/sdk-metrics", "@opentelemetry/api"]
source: https://www.npmjs.com
staleness-threshold-days: 60
---

# /infra-setup — Phase 0 Infrastructure Setup

Triggered by: `/infra-setup`
Run ONCE when starting a new project. Never run again.

If `src/` directory already exists → abort and tell the human "Infra already set up".

---

## What Gets Built

Run each step in order. Gate-check after all steps complete.

### Step 1 — Install All Dependencies

**Note:** Config files (`package.json`, `tsconfig.json`, `jest.config.ts`, `docker-compose.yml`, `Dockerfile`, `.dockerignore`, `.env.example`, `eslint.config.mjs`, `.prettierrc`, `.sequelizerc`, `.lintstagedrc.json`, `.nvmrc`) already exist in the template. So do the committed CI/automation files (`.github/workflows/ci.yml`, `.github/workflows/load-test.yml`, `.github/dependabot.yml`) and the OpenAPI exporter (`scripts/openapi.export.ts`). No need to create any of these.

Run npm install to get all dependencies:
```bash
# Production dependencies (no version pinning — installs latest LTS)
npm install \
  express \
  sequelize@6 \
  sequelize-typescript \
  pg \
  pg-hstore \
  zod \
  pino \
  jose \
  argon2 \
  helmet \
  cors \
  express-rate-limit \
  rate-limit-redis \
  bullmq \
  ioredis \
  uuid \
  compression \
  dotenv \
  reflect-metadata \
  @asteasolutions/zod-to-openapi \
  @opentelemetry/api \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics

# OTel note: keep every @opentelemetry/* package on ONE release line (the experimental
# packages share a 0.2xx version; the SDK pulls the matching stable trace/metrics cores).
# Do NOT bump @opentelemetry/api past the SDK's peer range. Logs are NOT sent over OTLP —
# they ship as pino JSON via Grafana Alloy (see docs/design-docs/observability.md), so no
# logs exporter / sdk-logs is installed.

# Sequelize is PINNED to v6 (sequelize@6) on purpose: sequelize-typescript v2 only supports
# Sequelize 6. Without the pin, "latest" could resolve Sequelize 7 at setup time and break the
# decorator models. Dependabot keeps the sequelize / sequelize-typescript / sequelize-cli trio
# moving together (see .github/dependabot.yml).

# Dev dependencies
npm install -D \
  typescript@5 \
  tsx \
  ts-jest \
  jest \
  supertest \
  @types/express \
  @types/node \
  @types/cors \
  @types/compression \
  @types/supertest \
  @types/uuid \
  @types/jest \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-plugin-boundaries \
  eslint-import-resolver-typescript \
  prettier \
  eslint-config-prettier \
  madge \
  husky \
  lint-staged \
  pino-pretty \
  yaml \
  sequelize-cli
```

> `eslint-plugin-boundaries` powers the mechanical layer-import enforcement in `eslint.config.mjs`
> (replaces the old structural-test-only check). `eslint-import-resolver-typescript` is required with
> it — boundaries must resolve the project's `.js`-extension ESM imports to .ts files, or it classifies
> nothing and enforces nothing. **`typescript` is pinned to 5.x**: TypeScript 6.0 changed default
> `@types` auto-inclusion and breaks the template's `tsconfig` (node globals go unresolved across
> `src/`); pin to 5.x and revisit (add `"types": ["node"]`) when migrating to TS 6.
> `@asteasolutions/zod-to-openapi` + `yaml` back the
> committed `scripts/openapi.export.ts` contract generator. `http-graceful-shutdown` is intentionally
> **not** installed — `server.ts` hand-rolls SIGTERM/SIGINT shutdown (Step 5), so the dep is redundant.

### Step 2 — Directory Structure
```bash
mkdir -p \
  src/{types,config,models,repo,services,runtime/{routes/v1,middleware,workers},providers/auth,utils} \
  tests/{architecture,unit/{services,repo,utils},integration,load} \
  db/{migrations,seeders} \
  docs/{product-specs/{draft,ready},exec-plans/{active,completed},design-docs/decisions,generated} \
  infra/monitoring \
  .github/workflows
```

### Step 3 — Environment & Config Files

Create `src/config/env.ts` — Zod-validated environment variables, `process.exit(1)` on validation failure.
Create `src/config/constants.ts` — app-wide constants (VALID_TRANSITIONS, etc.).
Create `src/config/timeouts.ts` — `DB_QUERY_MS=5000`, `EXTERNAL_API_MS=10000`, `REDIS_MS=1000`.
Create `src/config/database.ts` — Sequelize instance with pool config + timeouts. Do **not** pass
`models: [...]` here — that imports the models layer into config (a boundary violation). Register
models in `src/models/index.ts` via `sequelize.addModels([...])` (import `reflect-metadata` first
there): `models → config` is the only legal registration edge — neither config nor runtime may
import the models layer.
Create `src/config/logger.ts` — pino + trace-correlation mixin + guarded pretty transport.
Create `src/config/tracing.ts` — `withSpan()` helper (uses only `@opentelemetry/api`).
Create `src/config/metrics.ts` — counter/histogram helpers (uses only `@opentelemetry/api`).

> **Why logger/tracing/metrics live in Config, not Providers:** the layer rules let *every*
> domain layer import Config but forbid Service/Repo from importing Providers. These three helpers
> use only the `@opentelemetry/api` global, which is a safe no-op until the SDK starts — so they
> belong in Config. The `NodeSDK` itself stays in `providers/telemetry.ts` (Step 4).

**`src/config/env.ts`** — the OTEL block (append to the existing schema). Use `z.stringbool()`
for boolean flags — **never** `z.coerce.boolean()` (it turns the string `"false"` into `true`):
```typescript
// ...inside the zod schema object...
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),  // blank/unset ⇒ SDK no-ops
  OTEL_SERVICE_NAME: z.string().default('app'),
  OTEL_METRIC_EXPORT_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  APP_VERSION: z.string().default('0.0.1'),
  // example boolean flag done right:
  // OTEL_DEBUG: z.stringbool().default(false),
```

**`src/config/logger.ts`**:
```typescript
import pino from 'pino'
import { trace } from '@opentelemetry/api'
import { createRequire } from 'node:module'
import { env } from './env.js'

const require = createRequire(import.meta.url)
const tryResolve = (m: string): boolean => { try { require.resolve(m); return true } catch { return false } }
// pino-pretty is a devDependency — absent after `npm ci --omit=dev`. Guard so prod logs JSON.
const usePretty = env.NODE_ENV !== 'production' && tryResolve('pino-pretty')

export const logger = pino({
  level: env.LOG_LEVEL,
  // Deterministic trace↔log correlation, independent of auto-instrumentation patching.
  mixin() {
    const span = trace.getActiveSpan()
    if (!span) return {}
    const { traceId, spanId } = span.spanContext()
    return { trace_id: traceId, span_id: spanId }
  },
  ...(usePretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
})
```

**`src/config/tracing.ts`**:
```typescript
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api'

const tracer = trace.getTracer('app')

/** Wrap a unit of work in a span. No-op (zero overhead) when no SDK is started. */
export async function withSpan<T>(name: string, attrs: Attributes, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attrs)
    try {
      return await fn()
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message })
      span.recordException(err as Error)
      throw err
    } finally {
      span.end()
    }
  })
}
```

**`src/config/metrics.ts`**:
```typescript
import { metrics, type Attributes } from '@opentelemetry/api'

const meter = metrics.getMeter('app')
// Lazily created instruments; all are no-ops until an SDK MeterProvider is registered.
const counters = new Map<string, ReturnType<typeof meter.createCounter>>()

export function increment(name: string, attrs: Attributes = {}, by = 1): void {
  let c = counters.get(name)
  if (!c) { c = meter.createCounter(name); counters.set(name, c) }
  c.add(by, attrs)
}

export const httpRequestDuration = meter.createHistogram('http.server.duration', { unit: 'ms' })
```

### Step 4 — Providers

> The logger now lives in `src/config/logger.ts` (Step 3), **not** here — services may import
> Config but not Providers.

Create `src/providers/redis.ts` — ioredis singleton with retry.
Create `src/providers/telemetry.ts` — OTel `NodeSDK` init (boot-only, template below).
Create `src/providers/auth/jwt.ts` — jose sign + verify + revocation.
Create `src/providers/auth/middleware.ts` — requireAuth.
Create `src/providers/auth/rbac.ts` — requirePermission.
Create `src/providers/featureFlags.ts` — Redis-backed flag reader with static defaults
(makes the "feature flags" provider referenced in `ARCHITECTURE.md` real, not aspirational).

**`src/providers/featureFlags.ts`** — reads a Redis hash override, falls back to a static default
map in `config/constants.ts`. Uses Redis (a sibling provider) + Config only — never `process.env`
(that rule belongs to `env.ts`), so it stays layer-clean:
```typescript
import { redis } from './redis.js'
import { FEATURE_FLAG_DEFAULTS } from '../config/constants.js'

/** True when the flag is enabled. Redis override wins; otherwise the compiled-in default. */
export async function isEnabled(flag: keyof typeof FEATURE_FLAG_DEFAULTS): Promise<boolean> {
  const override = await redis.hget('feature_flags', flag)
  if (override !== null) return override === 'true'
  return FEATURE_FLAG_DEFAULTS[flag] ?? false
}
```
Add `export const FEATURE_FLAG_DEFAULTS = {} as const` to `config/constants.ts` (products add flags).

**`src/providers/telemetry.ts`** — boot-only. It must **not** statically import any instrumented
module (express/pg/ioredis/pino/the logger); doing so would load them before `sdk.start()` patches
them. Gated on `OTEL_EXPORTER_OTLP_ENDPOINT` so it is a clean no-op in tests/CI:
```typescript
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { env } from '../config/env.js'

let sdk: NodeSDK | undefined

export async function startTelemetry(): Promise<void> {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) return // no-op when unset (tests, CI, local-without-backend)

  // service.name / service.version are picked up automatically from the standard
  // OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES env vars (set in .env / docker-compose) —
  // no manual Resource needed, so no @opentelemetry/resources / semantic-conventions imports.
  sdk = new NodeSDK({
    // Traces → collector. Note the plural option names and the /v1/* path suffixes.
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: env.OTEL_METRIC_EXPORT_INTERVAL_MS,
      }),
    ],
    instrumentations: [getNodeAutoInstrumentations()],
  })
  await sdk.start()
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown()
}
```

### Step 5 — Runtime Layer
Create `src/runtime/middleware/helmet.ts` — all 7 headers.
Create `src/runtime/middleware/cors.ts` — allowlist from env.
Create `src/runtime/middleware/rateLimiter.ts` — 3 tiers with Redis store.
Create `src/runtime/middleware/requestId.ts` — X-Request-ID propagation.
Create `src/runtime/middleware/errorHandler.ts` — sanitised errors + logging.
Create `src/runtime/middleware/idempotency.ts` — Redis-backed idempotency for mutations
(makes the `security-auditor` A04 "idempotency keys on mutation endpoints" check real).
Create `src/runtime/openapi.ts` — the OpenAPI registry that `scripts/openapi.export.ts` reads.
Create `src/runtime/routes/v1/health.route.ts` — /health + /ready (DB ping + Redis ping).
Create `src/runtime/app.ts` — Express app with all middleware mounted.
Create `src/runtime/server.ts` — **boot telemetry first**, then listen + SIGTERM graceful shutdown.

**`src/runtime/middleware/idempotency.ts`** — apply to mutating routes. On the first request with an
`Idempotency-Key` header it stores the response keyed by `{userId}:{method}:{path}:{key}`; a replay
returns the cached response with `Idempotent-Replay: true`; a still-in-flight key returns `409 CONFLICT`.
Skips non-mutating methods and requests with no key. Keep it ≤ 400 lines; back it with the `redis` provider.

**`src/runtime/openapi.ts`** — the contract registry. Routes register their Zod schemas + paths here so
`npm run openapi:export` emits `docs/generated/openapi.{json,yaml}` (the frontend's `openapi-fetch`
source of truth). Call `extendZodWithOpenApi(z)` once before any schema uses `.openapi(...)`:
```typescript
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z) // enables `.openapi()` metadata on Zod schemas (call once, at import time)

export const registry = new OpenAPIRegistry()
// Each route registers itself, e.g.:
//   registry.registerPath({ method: 'post', path: '/applications', request: {...}, responses: {...} })
// `scripts/openapi.export.ts` imports this `registry` and generates the document.
```

**`src/runtime/server.ts`** — the ESM ordering fix. Auto-instrumentation can only patch a library
if the SDK starts **before** that library is first loaded. `server.ts` statically imports *only*
telemetry, starts it, then dynamically imports the app (which pulls in express/pg/redis/pino):
```typescript
import { startTelemetry, shutdownTelemetry } from '../providers/telemetry.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

async function main(): Promise<void> {
  await startTelemetry()                       // 1. patch instrumented libs before they load
  const { app } = await import('./app.js')     // 2. dynamic import AFTER sdk.start()

  const server = app.listen(env.PORT, () => logger.info({ event: 'server.start', port: env.PORT }))

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ event: 'server.shutdown', signal })
    server.close()
    await shutdownTelemetry()                   // flush spans/metrics before exit
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

void main()
```

> **Why dynamic import (not an `--import` flag):** the instrumented libs (express/pg/ioredis/pino)
> are CommonJS, so the SDK's require-hook patches them with no ESM loader hook needed — *as long as*
> `startTelemetry()` runs before the first `require`. The `await import('./app.js')` guarantees that
> ordering and works identically under `tsx` (dev) and `node dist/...` (prod), so no NODE_OPTIONS or
> start-command divergence. `dev`/`start` scripts in `package.json` stay unchanged.
Create `src/utils/response.util.ts` — `ok()` and `err()` envelope helpers.
Create `src/utils/uuid.util.ts` — `newId()` → uuidv7.

### Step 6 — Testing Scaffolds

**Note:** These already exist in the template — do NOT recreate them:
- `jest.config.ts` (per-layer coverage thresholds)
- `tests/architecture/layers.test.ts` (working layer-boundary structural tests)
- `tests/unit/utils/response.util.test.ts` (utils-layer example — pins the envelope contract)
- `tests/integration/health.test.ts` (route example using supertest)
- `tests/integration/isolation.test.template.ts` (copy per feature for cross-user isolation)

Create `tests/integration/setup.ts` — test DB lifecycle hooks (beforeAll/afterAll, truncate between tests, auth-token + createUser helpers referenced by the isolation template).

### Step 7 — GitHub Actions CI

**Do NOT create `ci.yml` — it already ships, committed, in the template.** `.github/workflows/ci.yml`
is a real, pinned, product-agnostic pipeline (not generated prose). It guards on whether `src/` exists,
so it stayed green on the bare template and switches on automatically the moment this step's code lands.

What it runs once `src/` exists:
- **quality**: `typecheck` → `lint` (boundaries-enforced) → `check:circular` → `test:coverage`
  (thresholds from `jest.config.ts`) → `build` → OpenAPI drift check (`openapi:export` + `git diff`)
- **secret-scan**: gitleaks (runs always, full history)
- **audit**: `npm audit --audit-level=high`
- **container**: Docker build → Trivy image scan (CRITICAL/HIGH) → SBOM (SPDX)
- **perf-smoke**: boots compose + runs `k6 smoke` against the p95/error budget (push-to-main only)

Also already shipped: `.github/workflows/load-test.yml` (manual k6 stress/soak), `.github/dependabot.yml`
(grouped npm + actions updates), `.github/pull_request_template.md`, `.github/CODEOWNERS`. **infra-setup
generates no workflow files.**

> Verify, don't author: after this step, push a branch and confirm the `quality` job goes from skipped
> to green. If a check fails, fix the source — never weaken the committed `ci.yml`.

> **Observability in CI:** leave `OTEL_EXPORTER_OTLP_ENDPOINT` **unset** in the test job so the
> SDK no-ops — never start the LGTM stack in CI. The `config/` helpers are exercised against the
> `@opentelemetry/api` no-op (fast, no infra). Backends are only run locally in dev.

### Step 8 — Git Hooks
```bash
npm run prepare   # init husky
# pre-commit: lint-staged + a local secret scan (gitleaks runs only if installed — the CI
# secret-scan job is the hard gate; this is a fast local pre-flight, never a blocker if absent).
npx husky add .husky/pre-commit 'npx lint-staged && (command -v gitleaks >/dev/null && gitleaks protect --staged --redact || true)'
npx husky add .husky/pre-push "npm test"
```

**Note:** `.lintstagedrc.json` already exists in template (ESLint + Prettier on staged TS files).

### Step 9 — Write ADRs
Create `docs/design-docs/decisions/ADR-000-infrastructure.md`:
- Document stack choices: why Express, why Sequelize, why jose (not jsonwebtoken), why argon2 (not bcrypt), why BullMQ
- Document architecture choices: why layered architecture, why Zod at repo boundary, why cursor pagination

`docs/design-docs/decisions/ADR-001-observability.md` and `docs/design-docs/observability.md`
already ship in the template — do **not** recreate them. They document the telemetry decisions
(otel-lgtm backend, logs-via-Alloy, helpers-in-Config) and the see-it/debug-it walkthrough.

---

## Gate Check

Run these checks to verify infra setup:

```bash
# 0. The one-command deterministic gate (typecheck + lint + circular + arch tests).
#    This is the same gate humans and CI run — prefer it over the individual steps below.
npm run gate

# 0b. OpenAPI contract generates cleanly (writes docs/generated/openapi.{json,yaml}).
npm run openapi:export

# 1. TypeScript compiles clean
npx tsc --noEmit

# 2. ESLint passes with zero warnings (now includes boundaries/dependencies layer checks)
npx eslint src/ --max-warnings=0

# 3. Architecture tests pass
npx jest tests/architecture/ --no-coverage

# 4. Health endpoint responds 200
npm run dev &
sleep 3
curl -f http://localhost:3000/health || echo "FAIL: health check"
pkill -f "node.*tsx"

# 5. No file exceeds 400 lines
find src/ -name "*.ts" -exec wc -l {} + | awk '$1 > 400 { print "FAIL:", $2, "has", $1, "lines" }'

# 6. Telemetry is a clean no-op when the endpoint is unset (the CI/test default).
#    With OTEL_EXPORTER_OTLP_ENDPOINT blank, the app must boot and /health must still pass.
OTEL_EXPORTER_OTLP_ENDPOINT= npm run dev &
sleep 3
curl -f http://localhost:3000/health || echo "FAIL: telemetry no-op boot"
pkill -f "node.*tsx"

# 7. (optional, dev only) End-to-end telemetry — see docs/design-docs/observability.md:
#    docker compose up -d lgtm alloy → set OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 →
#    hit /health a few times → confirm a Tempo trace + Prometheus metrics + correlated Loki logs
#    in Grafana at http://localhost:3001 (admin/admin).
```

---

## Commit

```bash
git init
git add -A
git commit -m "chore(infra): phase 0 infrastructure setup

- Express + TypeScript + Sequelize (latest LTS)
- Security middleware: helmet, cors, rate-limit (Redis store), idempotency keys (mutations)
- Feature-flags provider (Redis-backed, static defaults in config)
- Pino structured logging (config/logger.ts) with trace-correlation mixin
- OpenTelemetry: traces + metrics via NodeSDK (boot-first), withSpan/metrics helpers in config/
- Observability backend: grafana/otel-lgtm + Alloy log shipping (docker-compose)
- BullMQ + ioredis for background jobs
- Health checks: /health + /ready (DB + Redis ping)
- Graceful SIGTERM shutdown (flushes telemetry)
- OpenAPI contract export (zod-to-openapi) → docs/generated/openapi.{json,yaml}
- Layer-import enforcement: eslint-plugin-boundaries + structural tests + madge
- Docker multi-stage build + .dockerignore + docker-compose (app + postgres + redis + lgtm + alloy)
- Git hooks: pre-commit (lint-staged + gitleaks), pre-push (test)
- ADR-000: infrastructure decisions; ADR-001: observability decisions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

git push origin main
```
