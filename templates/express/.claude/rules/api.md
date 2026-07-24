---
paths:
  - "src/runtime/routes/**/*.ts"
---

# API Rules — Auto-injected on route file edits

## Route File Checklist (verify before every route)

### Versioning
```typescript
// ✅ All routes under version prefix
// File: src/runtime/routes/v1/applications.route.ts
router.get('/applications', ...)   // mounted at /api/v1/applications

// ❌ Never create unversioned routes
app.get('/applications', ...)  // no version = breaking changes are impossible to manage
```

### Route ordering — register literal sub-paths BEFORE `/:id`

Express matches routes in registration order. Register specific/literal sub-paths (e.g. `/count`,
`/search`) **before** any parameterized route (`/:id`) on the same router — otherwise
`GET /bookmarks/count` is captured by `GET /bookmarks/:id` with `id="count"`, and the aggregate
handler never runs (the `:id` handler 404s on the bogus id).

```typescript
// ✅ Literal paths first, parameterized last
router.get('/count',  countHandler)   // GET /bookmarks/count
router.get('/search', searchHandler)  // GET /bookmarks/search
router.get('/:id',    getByIdHandler) // GET /bookmarks/:id

// ❌ /:id registered first shadows /count and /search (id becomes "count" / "search")
router.get('/:id',   getByIdHandler)
router.get('/count', countHandler)    // unreachable
```

### Required Handler Structure (every protected route)
```typescript
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth   = await requireAuth(req)                           // 1. Auth
    const body   = CreateApplicationSchema.parse(req.body)          // 2. Validate
    const result = await applicationService.create(auth.userId, body) // 3. Service
    return res.status(201).json(ok(result, req.requestId))          // 4. Respond
  } catch (err) { next(err) }                                       // 5. Error handler
})
```

### Rate Limits (pick correct tier per route)
```typescript
// Auth endpoints — strict (10/min — brute force protection)
router.post('/login',    authRateLimit, handler)
router.post('/register', authRateLimit, handler)

// Public read endpoints — moderate (60/min)
router.get('/public-data', publicRateLimit, handler)

// Authenticated user endpoints — generous (300/min)
router.use(userRateLimit)   // apply at router level for all user routes
```

### Response Envelope — Canonical Shape (always)

Every response carries a top-level `ok` discriminator so the frontend can branch
on one field. This shape is identical across all backends in the harness family.

```jsonc
// ✅ Success
{
  "ok": true,
  "data": { /* ... */ },
  "meta": { "requestId": "01932b3e-4f5a-7b8c-9d0e-1f2a3b4c5d6e", "timestamp": "..." }
}

// ✅ Error
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",  // | NOT_FOUND | UNAUTHORIZED | FORBIDDEN | CONFLICT | RATE_LIMITED | INTERNAL_ERROR
    "message": "Human-readable error message"
  },
  "meta": { "requestId": "01932b3e-4f5a-7b8c-9d0e-1f2a3b4c5d6e" }
}
```

```typescript
// ✅ Success: use ok() helper — sets ok: true + data + meta
res.status(200).json(ok(data, req.requestId))

// ✅ Error: use next(err) — errorHandler maps it to the canonical error shape
next(new NotFoundError('Application not found'))

// ❌ Never raw JSON
res.json({ data: result })             // missing ok + meta
res.json({ error: err.message })       // wrong format
```

**Error code enum** (the only allowed `error.code` values):
`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`.

**HTTP status mapping** (the `errorHandler` sets these — a Zod/validation failure is **422**, never 400):
`VALIDATION_ERROR` → **422** (Zod parse / invalid body — Unprocessable Entity), `NOT_FOUND` → 404,
`UNAUTHORIZED` → 401, `FORBIDDEN` → 403, `CONFLICT` → 409, `RATE_LIMITED` → 429, `INTERNAL_ERROR` → 500.
A `ZodError` MUST map to `422 VALIDATION_ERROR`. The one exception is a malformed-JSON body
(body-parser `SyntaxError`), which stays **400 Bad Request** — it never parsed, so it isn't a
validation failure. This matches `.claude/rules/testing.md` (`expect(res.status).toBe(422)`).

**`meta` shape** (pinned by `tests/unit/utils/response.util.test.ts`): success carries
`{ requestId, timestamp }`; errors carry `{ requestId }` only. The timestamp asymmetry is intentional —
error responses stay minimal. This is identical across the harness family; do not add fields ad-hoc.

### Required Response Headers (applied by middleware — verify they're mounted)
```typescript
// In src/runtime/app.ts — these must be present
app.use(helmetMiddleware)   // 7 security headers
app.use(requestIdMiddleware) // X-Request-ID propagation
app.use(corsMiddleware)     // CORS configured centrally
```

### Pagination (all list endpoints)

Cursors are encoded with **base64url** (URL-safe, no padding) — standardised
across the harness so cursors are portable between services and safe in query strings.

```typescript
// ✅ Accept cursor from query params (base64url)
const cursor = req.query.cursor
  ? (JSON.parse(Buffer.from(req.query.cursor as string, 'base64url').toString()) as PageCursor)
  : undefined
const limit = Math.min(Number(req.query.limit) || 20, 100) // cap at 100

const result = await applicationService.list(auth.userId, { cursor, limit })
return res.json(ok(result, req.requestId))
// → { ok: true, data: { items: [...], nextCursor: 'base64url...', hasMore: true }, meta: {...} }

// ❌ Never accept raw offset/page params on user-facing endpoints
// ❌ Never use plain base64 — use base64url for URL safety
```

### Idempotency (mutation endpoints)

Mutating routes (POST/PUT/PATCH/DELETE) accept an optional `Idempotency-Key` header, handled by
`src/runtime/middleware/idempotency.ts` (Redis-backed). Mount it at the **router level** — it already
no-ops on GET and keyless requests, so it's safe across the whole router:

```typescript
router.use(idempotency)   // all mutating routes on this router; no-ops on GET/keyless
// userRateLimit is likewise mounted at the router level (see Rate Limits above)
router.post('/', async (req, res, next) => { ... })
```

> **Why router-level, not inline.** Under Express 5 + `exactOptionalPropertyTypes`, chaining inline
> middleware before the handler (`router.post('/:id', idempotency, handler)`) makes `req.params`
> infer as `string | string[] | undefined`, so `req.params.id` fails `tsc` (TS2345). A
> single-handler route infers `{ id: string }` cleanly. Keep handlers single-argument by mounting
> shared middleware with `router.use(...)`. If you genuinely must chain middleware inline on a
> parameterized route, annotate the handler explicitly: `(req: Request<{ id: string }>, res, next)`.

- **First call** with a given key → handler runs; response is cached under `{userId}:{method}:{path}:{key}`.
- **Replay** (same key) → cached response returned with header `Idempotent-Replay: true`.
- **In-flight** (key still processing) → `409 CONFLICT` (`error.code: "CONFLICT"`).
- No key, or non-mutating method → middleware is a pass-through.

This is what the `security-auditor` A04 check ("idempotency keys on mutation endpoints") verifies.

### OpenAPI registration (every route)

The harness publishes one machine-readable contract for the frontend's `openapi-fetch` client.
For every path, add a `registry.registerPath({...})` call **inside `src/runtime/openapi.ts`
itself** — importing that path's Zod request/response schemas from your `types`/route module —
then `npm run openapi:export` regenerates `docs/generated/openapi.{json,yaml}`.

**Register in `openapi.ts`, never in the route file.** `scripts/openapi.export.ts` imports only
`src/runtime/openapi.ts`, so a `registerPath` call living in a route file never runs → the
exporter silently writes **0 paths**. (And importing routes *into* `openapi.ts` is a circular
import, because routes import the registry.) So the registry and every registration live together
in `openapi.ts`:

```typescript
// src/runtime/openapi.ts
import { CreateApplicationSchema } from '../types/application.types.js'

registry.registerPath({
  method: 'post',
  path: '/applications',
  request: { body: { content: { 'application/json': { schema: CreateApplicationSchema } } } },
  responses: { 201: { description: 'Created' /* ...envelope... */ } },
})
```

**Typed response components — never call `.openapi()` on a schema imported from the Types layer.**
`extendZodWithOpenApi(z)` (called once at the top of `openapi.ts`) only augments Zod schemas **created
after it runs**. A schema built in a `*.types.ts` file and imported into `openapi.ts` was created
before this module loaded, so it has **no `.openapi()` method** — calling it throws
`X.openapi is not a function`. Every current template path is description-only, so the **first product
to register a typed response component hits this.** Fix: build the response envelope/component
**inside `openapi.ts`** (post-extend) and nest the imported Types-layer schema as a plain child — keep
the Types layer import-free of any OpenAPI concern.

```typescript
// src/runtime/openapi.ts — extendZodWithOpenApi(z) has ALREADY run at the top of this module
import { ApplicationSchema } from '../types/application.types.js' // plain Zod — no .openapi()

// ✅ Nest the imported schema as a plain child of an envelope component built HERE (post-extend):
const ApplicationResponse = registry.register(
  'ApplicationResponse',
  z.object({
    ok: z.literal(true),
    data: ApplicationSchema, // imported schema used as a child — no .openapi() call on it
    meta: z.object({ requestId: z.string(), timestamp: z.string() }),
  }),
)

// ❌ Never call .openapi() on a schema imported from the Types layer — the method isn't there:
//    ApplicationSchema.openapi('Application')  // TypeError: ApplicationSchema.openapi is not a function
```

> Alternative (NOT preferred): call `extendZodWithOpenApi(z)` inside the Types layer so imported
> schemas gain `.openapi()`. Avoid it — it leaks OpenAPI concerns into Types. Prefer the
> nest-in-`openapi.ts` pattern above and keep Types OpenAPI-free.

CI fails if the committed contract drifts from the code (the `quality` job runs `openapi:export`
and `git diff`). Regenerate and commit `docs/generated/openapi.*` whenever a route or schema changes.
