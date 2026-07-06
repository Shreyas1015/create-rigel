# Observability — See It & Debug It

How traces, metrics, and logs flow through this service, how to look at them in Grafana, and how
to use them to debug a real problem. Read this once; it pays for itself the first time something
is slow in a way you can't reproduce locally.

---

## Mental model (one line)

> **Traces + metrics → OTLP → otel-lgtm collector. Logs → pino JSON (correlated by a span-reading
> mixin) → Alloy → Loki.** Helpers live in `config/` so services stay clean; the `NodeSDK` lives
> only in `providers/telemetry.ts` and boots *before* the app is imported.

```
                                   ┌────────────────────────────────────────────┐
                                   │            grafana/otel-lgtm                 │
  ┌─────────────┐  OTLP/HTTP :4318 │  Collector → Tempo (traces)                  │
  │             │ ───────────────► │             → Prometheus (metrics)           │
  │   Node app  │   traces+metrics │             → Loki (logs)                    │
  │  (Express)  │                  │  Grafana UI  :3000 → published on host :3001 │
  │             │  stdout JSON     └───────▲──────────────────────────────────────┘
  │  pino ──────┼──► (docker logs) ─┐      │ push to Loki :3100
  └─────────────┘   trace_id/span_id│  ┌───┴────────┐
                                    └─►│   Alloy     │  tails container stdout, parses pino JSON
                                       └─────────────┘
```

Why logs take the side road through Alloy instead of OTLP: under ESM, `@opentelemetry/instrumentation-pino`'s
OTLP log-sending does not reliably emit. So we **don't** depend on it. Correlation is done
deterministically by a pino `mixin` that reads the active span; shipping is done by Alloy tailing
stdout. Decoupled and boring — exactly what you want from logging.

---

## Where the code lives

| Concern | File | Notes |
|---|---|---|
| SDK boot (traces+metrics) | `src/providers/telemetry.ts` | The **only** file importing `NodeSDK`. Boot-only, excluded from coverage. |
| Boot ordering | `src/runtime/server.ts` | `await startTelemetry()` **then** `await import('./app.js')`. |
| Logger | `src/config/logger.ts` | pino + trace-correlation mixin + guarded pretty transport. |
| Spans | `src/config/tracing.ts` | `withSpan(name, attrs, fn)`. No-op when SDK off. |
| Metrics | `src/config/metrics.ts` | `increment()`, histograms. No-op when SDK off. |
| Env flags | `src/config/env.ts` | `OTEL_*`. Blank endpoint ⇒ everything no-ops. |
| Local backend | `docker-compose.yml` (`lgtm`, `alloy`) | All-in-one; nothing to configure. |
| Log shipping | `infra/monitoring/alloy/config.alloy` | stdout JSON → Loki. |

---

## Quickstart

```bash
# 1. Start the backend (and the app) with telemetry wired up.
docker compose up -d

# 2. Open Grafana.
#    http://localhost:3001   (user: admin   password: admin)

# 3. Generate some signal.
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

> Running the app outside Docker (`npm run dev`)? Start just the backend and point the app at it:
>
> ```bash
> docker run -d --name lgtm -p 3001:3000 -p 4317:4317 -p 4318:4318 grafana/otel-lgtm
> # in .env:  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
> ```
>
> Logs won't reach Loki this way (Alloy isn't running), but they print to your terminal with
> `trace_id`, and traces+metrics still flow to Grafana.

---

## See traces (Tempo)

1. Grafana → **Explore** (compass icon) → data source **Tempo**.
2. Query type **Search** → run. You'll see recent traces, one row per request (e.g. `GET /health`).
3. Click a trace → the **span waterfall**. Express, the DB query (pg), and Redis each appear as a
   span with its own duration. This is where you find *which part* of a request was slow.

What produces these spans: `getNodeAutoInstrumentations()` patches http/express/pg/ioredis
automatically. Your own service methods add spans via `withSpan(...)` (see below).

## See metrics (Prometheus)

1. Explore → data source **Prometheus**.
2. Try `http_server_duration_milliseconds_count` or any custom counter you emitted via
   `increment('domain.action')`. Auto-instrumentation also emits HTTP server duration histograms.

## See logs (Loki)

1. Explore → data source **Loki**.
2. Query: `{service_name="myapp"}` (the label Alloy derives from the container name).
3. Each line is the pino JSON, including `trace_id`, `span_id`, `level`, and your `event` field.
   Filter by level with the `level` label, e.g. `{service_name="myapp", level="error"}`.

---

## Debug a slow request (the payoff)

You get a report: "some `/applications` calls take 2 seconds." You can't reproduce it. Here's the loop:

1. **Find it in logs.** Loki: `{service_name="myapp"} | json | durationMs > 1000`. You get the
   exact log line for a slow call, with its `trace_id`.
2. **Jump to the trace.** Click the `trace_id` value → "Tempo" link (Grafana wires log↔trace via
   the shared id). You land on that request's span waterfall.
3. **Read the waterfall.** One span dominates — say a `pg` query span at 1.8s. Now you know it's the
   database, not your code, not Redis, not the network.
4. **Confirm the pattern in metrics.** Prometheus: is DB query duration elevated across the board,
   or just this endpoint? That tells you "fix this query" vs "the DB is under load."
5. **Fix and verify.** After the fix, the same Loki→Tempo→Prometheus loop confirms the slow span is
   gone — no guessing, no "works on my machine."

The whole point: **logs tell you *that* it was slow, traces tell you *where*, metrics tell you *how
often*.** They're joined by `trace_id`, so you move between them in two clicks.

---

## Instrumenting your own code

Service methods keep the existing structured log **and** wrap their work in a span:

```typescript
import { withSpan } from '../config/tracing.js'
import { increment } from '../config/metrics.js'
import { logger } from '../config/logger.js'

export async function createApplication(userId: string, input: CreateApplicationInput) {
  const start = Date.now()
  return withSpan('application.create', { userId }, async () => {
    const app = await applicationRepo.insert(userId, input)
    increment('application.created')
    logger.info({ event: 'application.create', userId, applicationId: app.id, durationMs: Date.now() - start })
    return app
  })
}
```

Because `withSpan` is active, every `logger.*` call inside it automatically carries that span's
`trace_id`/`span_id` (the mixin reads the active span). You don't thread anything by hand.

---

## Turning it off (tests / CI / local)

Leave **`OTEL_EXPORTER_OTLP_ENDPOINT` blank**. `startTelemetry()` returns early, no SDK starts, and
`withSpan`/`metrics`/`logger` fall back to the `@opentelemetry/api` no-op — zero overhead, no
network, no backend needed. This is the default for `npm test` and CI. **Never** start the LGTM
stack in CI.

---

## Production

The otel-lgtm image is for **dev/demo/testing**, not production. In prod, point
`OTEL_EXPORTER_OTLP_ENDPOINT` at your real collector (e.g. Grafana Cloud, an OTel Collector
deployment, or a vendor endpoint) and run a log agent (Alloy/Promtail/vendor) against stdout. The
app code does not change — only the endpoint and the log shipper's destination.

---

## Gotchas → solutions (the hard-won bits)

1. **ESM import hoisting broke instrumentation.** A static `import` of the app loaded express/pg/redis
   before the SDK started, so nothing got patched. → `server.ts` `await startTelemetry()` first,
   then `await import('./app.js')`. `telemetry.ts` must not statically import any instrumented module.
2. **Service can't import Providers** (layer rule, enforced by madge). → `withSpan`/`metrics`/`logger`
   live in `config/` (every layer may import Config) and use only the `@opentelemetry/api` global.
3. **`z.coerce.boolean('false') === true`.** → Use `z.stringbool()` (zod 4) for boolean env flags.
4. **NodeSDK option/version skew.** → Use the plural `metricReaders` (and `logRecordProcessors` if you
   ever add OTLP logs). Keep every `@opentelemetry/*` on one release line; don't bump `api` past the
   SDK's peer range.
5. **`pino-pretty` crashed the prod image.** It's a devDependency, absent after `npm ci --omit=dev`.
   → `logger.ts` only uses the pretty transport if `require.resolve('pino-pretty')` succeeds; prod
   logs JSON.
6. **Logs never reached Loki under ESM.** The pino→OTLP bridge silently emitted nothing (verified by
   a missing `trace_id`). → Two parts: deterministic correlation via a pino `mixin` reading the active
   span, and shipping via Alloy tailing stdout JSON. Independent of auto-patching.
7. **Coverage gates.** `telemetry.ts` is boot-only → excluded from coverage (like `server.ts`).
   Unit-test the `config/` helpers against the no-op API (fast, no infra).
8. **Port clash.** otel-lgtm's Grafana defaults to 3000 → published on host **3001** so it doesn't
   collide with the app/frontend.
9. **CI.** Leave `OTEL_EXPORTER_OTLP_ENDPOINT` blank in tests so the SDK no-ops; never start the LGTM
   stack in CI. Verify against real backends only in dev.

---

## See also

- `docs/design-docs/decisions/ADR-001-observability.md` — *why* these choices were made.
- `ARCHITECTURE.md` — the layer rules that put the helpers in Config and the SDK in Providers.
