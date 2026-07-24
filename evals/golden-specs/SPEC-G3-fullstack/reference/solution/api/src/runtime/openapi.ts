/**
 * OpenAPI contract registry (runtime). Routes register their Zod schemas + paths here so
 * `npm run openapi:export` emits docs/generated/openapi.{json,yaml} — the frontend's
 * openapi-fetch source of truth. `extendZodWithOpenApi(z)` must run once before any schema
 * uses `.openapi(...)`.
 */
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { LoginSchema, RegisterSchema } from '../types/auth.types.js'
import {
  BookmarkCountSchema,
  CreateBookmarkSchema,
  UpdateBookmarkSchema,
} from '../types/bookmark.types.js'

extendZodWithOpenApi(z) // enables `.openapi()` metadata on Zod schemas (call once, at import time)

export const registry = new OpenAPIRegistry()

// --- Named contract component (SPEC-G3) ---
// The count endpoint ships a real response SCHEMA (the other paths are description-only), so
// openapi-typescript emits `components['schemas']['BookmarkCountResponse']` on the frontend and
// the badge imports its number type from THAT (SPEC-G3 AC-2), never a hand-written shape.
//
// The envelope is built HERE (after extendZodWithOpenApi ran) so `.openapi()`/`register` are
// available; `BookmarkCountSchema` (imported from the Types layer, created before extend ran)
// is nested as a plain child schema — the generator introspects it structurally, no `.openapi()`
// call on the imported schema (which would throw — the method is only on post-extend schemas).
const BookmarkCountResponse = registry.register(
  'BookmarkCountResponse',
  z.object({
    ok: z.boolean(),
    data: BookmarkCountSchema,
    meta: z.object({ requestId: z.string(), timestamp: z.string() }),
  })
)

// Paths are registered HERE (not in the route files): scripts/openapi.export.ts imports only this
// module, so a route-file registration would never run (and importing routes here would be a
// circular import — routes import this registry). Register request/response schemas per path.

// --- Auth & accounts (SPEC-001 / PLAN-001) ---
registry.registerPath({
  method: 'post',
  path: '/auth/register',
  tags: ['auth'],
  request: { body: { content: { 'application/json': { schema: RegisterSchema } } } },
  responses: { 201: { description: 'Account created; access token in body, refresh cookie set' } },
})
registry.registerPath({
  method: 'post',
  path: '/auth/login',
  tags: ['auth'],
  request: { body: { content: { 'application/json': { schema: LoginSchema } } } },
  responses: {
    200: { description: 'Authenticated; access token in body, refresh cookie set' },
    401: { description: 'Invalid credentials' },
  },
})
registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  tags: ['auth'],
  responses: {
    200: { description: 'New access token issued from the refresh cookie' },
    401: { description: 'Missing/invalid refresh cookie' },
  },
})
registry.registerPath({
  method: 'get',
  path: '/auth/me',
  tags: ['auth'],
  responses: {
    200: { description: 'The authenticated caller' },
    401: { description: 'Missing/invalid access token' },
  },
})

// --- Bookmarks CRUD (SPEC-002 / PLAN-002) — all owner-scoped, requireAuth ---
const BookmarkIdParams = z.object({ id: z.string() })

registry.registerPath({
  method: 'post',
  path: '/bookmarks',
  tags: ['bookmarks'],
  request: { body: { content: { 'application/json': { schema: CreateBookmarkSchema } } } },
  responses: {
    201: { description: 'Bookmark created (status defaults to unread)' },
    401: { description: 'Missing/invalid access token' },
    422: { description: 'Validation error (invalid url / missing title / bad tags)' },
  },
})
registry.registerPath({
  method: 'get',
  path: '/bookmarks',
  tags: ['bookmarks'],
  responses: {
    200: { description: "Cursor-paginated list of the caller's bookmarks (newest-first)" },
    401: { description: 'Missing/invalid access token' },
  },
})
registry.registerPath({
  method: 'get',
  path: '/bookmarks/count',
  tags: ['bookmarks'],
  summary: "Count of the caller's bookmarks",
  responses: {
    200: {
      description: "The caller's bookmark count",
      content: { 'application/json': { schema: BookmarkCountResponse } },
    },
    401: { description: 'Missing/invalid access token' },
  },
})
registry.registerPath({
  method: 'get',
  path: '/bookmarks/{id}',
  tags: ['bookmarks'],
  request: { params: BookmarkIdParams },
  responses: {
    200: { description: 'The bookmark' },
    401: { description: 'Missing/invalid access token' },
    404: { description: "Not found (absent or not the caller's)" },
  },
})
registry.registerPath({
  method: 'patch',
  path: '/bookmarks/{id}',
  tags: ['bookmarks'],
  request: {
    params: BookmarkIdParams,
    body: { content: { 'application/json': { schema: UpdateBookmarkSchema } } },
  },
  responses: {
    200: { description: 'The updated bookmark' },
    401: { description: 'Missing/invalid access token' },
    404: { description: "Not found (absent or not the caller's)" },
    422: { description: 'Validation error' },
  },
})
registry.registerPath({
  method: 'delete',
  path: '/bookmarks/{id}',
  tags: ['bookmarks'],
  request: { params: BookmarkIdParams },
  responses: {
    200: { description: 'Soft-deleted' },
    401: { description: 'Missing/invalid access token' },
    404: { description: "Not found (absent or not the caller's)" },
  },
})
