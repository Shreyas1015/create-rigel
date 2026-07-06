# ADR-001 — Observability (Traces, Metrics, Logs)

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** Phase 0
**See also:** `docs/design-docs/observability.md` (the see-it/debug-it walkthrough)

---

## Context

Core belief #6 ("observability is not optional") and `QUALITY_SCORE.md` require structured logging
and OTel spans on every service boundary, so that production issues can be reproduced — and fixed by
agents — from telemetry alone. We need a concrete, low-friction implementation that works in dev,
no-ops cleanly in tests/CI, and respects the layered-architecture import rules. This ADR records the
non-obvious choices; the mechanics live in `observability.md`.

---

## Decisions

### Signals: OpenTelemetry SDK (`@opentelemetry/sdk-node`), one release line
- Traces + metrics exported via OTLP/HTTP (`exporter-trace-otlp-http`, `exporter-metrics-otlp-http`)
  with `getNodeAutoInstrumentations()` (http/express/pg/ioredis patched for free).
- All `@opentelemetry/*` packages pinned to the same release line; `@opentelemetry/api` is kept
  within the SDK's peer range. Version skew here is the most common source of silent breakage.

### Local backend: `grafana/otel-lgtm` (all-in-one)
- A single container bundles the OTel Collector + Prometheus (metrics) + Tempo (traces) + Loki
  (logs) + Grafana. Zero config, OTLP defaults, one `docker compose up`.
- Alternatives rejected: wiring discrete collector + Prometheus + Tempo + Loki + Grafana services —
  far more YAML and moving parts for a template, with no dev-time benefit.
- Grafana is published on host **3001** (its in-container default is 3000) to avoid clashing with
  the app/frontend.
- **Not for production** — prod points `OTEL_EXPORTER_OTLP_ENDPOINT` at a real collector / Grafana
  Cloud; app code is unchanged.

### Logs: pino JSON → Alloy → Loki (not OTLP from the app)
- Under ESM, `@opentelemetry/instrumentation-pino`'s OTLP log-sending does not reliably emit, so we
  do not depend on it. Instead:
  1. **Correlation** is deterministic — a pino `mixin` reads `trace.getActiveSpan()` and stamps
     `trace_id`/`span_id` on every line, independent of auto-instrumentation patching.
  2. **Shipping** is decoupled — Grafana Alloy tails container stdout JSON and pushes to Loki.
- Consequence: we **do not install** `@opentelemetry/exporter-logs-otlp-http` or
  `@opentelemetry/sdk-logs`; the `NodeSDK` carries only `traceExporter` + `metricReaders`. Fewer
  packages, no ESM log-export bug to fight.

### Helpers live in Config, the SDK lives in Providers
- The layer rules let every domain layer import `config/` but forbid Service/Repo from importing
  `providers/` (enforced by madge). So `logger`, `withSpan` (tracing), and `metrics` live in
  `src/config/` and use only the `@opentelemetry/api` global (a safe no-op until an SDK starts).
- The `NodeSDK` itself lives only in `src/providers/telemetry.ts`, boot-only.

### Boot order: start the SDK before importing the app (ESM)
- Auto-instrumentation can only patch a library loaded *after* `sdk.start()`. `src/runtime/server.ts`
  statically imports only telemetry, calls `await startTelemetry()`, then `await import('./app.js')`.
- The instrumented libs (express/pg/ioredis) are CommonJS, so the SDK's require-hook patches them
  with no ESM loader hook needed — provided the start runs before the first `require`. This pattern
  is identical under `tsx` (dev) and `node dist/...` (prod), so there is no start-command divergence
  and no `NODE_OPTIONS`/`--import` flag to maintain.

### Off by default in tests/CI
- Gate on `OTEL_EXPORTER_OTLP_ENDPOINT`: blank ⇒ `startTelemetry()` returns early and all helpers
  no-op. `npm test`/CI run with it unset and never start the LGTM stack.
- `providers/telemetry.ts` is boot-only and excluded from coverage (like `server.ts`); the `config/`
  helpers are unit-tested against the no-op API.

### Env booleans: `z.stringbool()`, never `z.coerce.boolean()`
- `z.coerce.boolean('false')` is `true` (any non-empty string is truthy). Boolean `OTEL_*` flags use
  zod 4's `z.stringbool()`.

---

## Consequences

- One `docker compose up` gives a full local trace/metric/log stack with log↔trace correlation.
- Services stay clean: `withSpan(...)` + the existing `logger.info({ event, durationMs })`, no
  Provider imports, no manual trace-context threading.
- Logging is resilient to OTel/ESM churn because correlation and shipping don't depend on the pino
  auto-instrumentation.
- Adding OTLP log export later (if the ESM gap closes) is additive: install `sdk-logs` +
  `exporter-logs-otlp-http`, add `logRecordProcessors` to the SDK, drop Alloy. No app-code change.
