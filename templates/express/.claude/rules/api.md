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
`src/runtime/middleware/idempotency.ts` (Redis-backed). Wire it in front of the handler:

```typescript
router.post('/', idempotency, userRateLimit, async (req, res, next) => { ... })
```

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

CI fails if the committed contract drifts from the code (the `quality` job runs `openapi:export`
and `git diff`). Regenerate and commit `docs/generated/openapi.*` whenever a route or schema changes.
