/**
 * Bookmark routes (Runtime layer). Handler order every time: auth → validate → service →
 * respond → next(err). `requireAuth` is mounted at the router level so every endpoint is
 * owner-scoped and an unauthenticated request is 401. Mutations honour `Idempotency-Key`.
 *
 *   POST   /api/v1/bookmarks      201  create
 *   GET    /api/v1/bookmarks      200  list (cursor-paginated, ?status= ?tag= ?cursor= ?limit=)
 *   GET    /api/v1/bookmarks/:id  200  fetch one (404 if not owner)
 *   PATCH  /api/v1/bookmarks/:id  200  update title/note/tags/status (404 if not owner)
 *   DELETE /api/v1/bookmarks/:id  200  soft-delete (404 if not owner)
 *
 * Invalid request bodies are 422 VALIDATION_ERROR (safeParse → ValidationError): SPEC-002 AC-6
 * and .claude/rules/testing.md both require 422, whereas the global ZodError handler maps to 400.
 */
import { Router } from 'express'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../config/constants.js'
import { requireAuth } from '../../../providers/auth/middleware.js'
import * as bookmarkService from '../../../services/bookmark.service.js'
import {
  BookmarkStatusSchema,
  CreateBookmarkSchema,
  UpdateBookmarkSchema,
  type ListBookmarksFilter,
} from '../../../types/bookmark.types.js'
import { PageCursorSchema, type PageCursor } from '../../../types/common.types.js'
import { ValidationError } from '../../../utils/errors.util.js'
import { ok } from '../../../utils/response.util.js'
import { idempotency } from '../../middleware/idempotency.js'

export const bookmarksRouter: Router = Router()

// Auth first — applies to every route below; an unauthenticated request never reaches a handler.
bookmarksRouter.use(requireAuth)
// Idempotency-Key replay protection. A no-op pass-through for GET / keyless requests; caches
// POST/PATCH/DELETE responses by {userId}:{method}:{path}:{key}. Mounted after auth so the cache
// key carries the caller's userId (and mounted at router level so :id param types stay inferred).
bookmarksRouter.use(idempotency)

/** Decode a base64url JSON cursor into a validated PageCursor; malformed input is 422. */
function decodeCursor(raw: unknown): PageCursor | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8')
    const parsed = PageCursorSchema.safeParse(JSON.parse(json))
    if (!parsed.success) throw new Error('bad cursor shape')
    return parsed.data
  } catch {
    throw new ValidationError('Invalid cursor')
  }
}

/** Encode a PageCursor to a URL-safe base64url string for the response. */
function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

/** Parse ?limit into a bounded page size (default 20, capped at 100). */
function parseLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(Math.floor(n), MAX_PAGE_SIZE)
}

/** Parse ?status / ?tag filters; an unknown status value is 422. */
function parseFilter(statusRaw: unknown, tagRaw: unknown): ListBookmarksFilter {
  const filter: ListBookmarksFilter = {}
  if (typeof statusRaw === 'string' && statusRaw.length > 0) {
    const parsed = BookmarkStatusSchema.safeParse(statusRaw)
    if (!parsed.success) throw new ValidationError('Invalid status filter')
    filter.status = parsed.data
  }
  if (typeof tagRaw === 'string' && tagRaw.length > 0) filter.tag = tagRaw
  return filter
}

bookmarksRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    const parsed = CreateBookmarkSchema.safeParse(req.body)
    if (!parsed.success) throw new ValidationError('Invalid bookmark payload')
    const bookmark = await bookmarkService.create(userId, parsed.data)
    res.status(201).json(ok(bookmark, req.requestId!))
  } catch (err) {
    next(err)
  }
})

bookmarksRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    const cursor = decodeCursor(req.query.cursor)
    const limit = parseLimit(req.query.limit)
    const filter = parseFilter(req.query.status, req.query.tag)
    const page = await bookmarkService.list(
      userId,
      cursor ? { cursor, limit, filter } : { limit, filter }
    )
    res.json(
      ok(
        {
          items: page.items,
          nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
          hasMore: page.hasMore,
        },
        req.requestId!
      )
    )
  } catch (err) {
    next(err)
  }
})

// GET /count is registered BEFORE GET /:id — Express matches routes in declaration order, so a
// `/:id` registered first would capture `/count` as `id="count"` and 404. This static segment
// must win (SPEC-G3 AC-1).
bookmarksRouter.get('/count', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    const result = await bookmarkService.count(userId)
    res.json(ok(result, req.requestId!))
  } catch (err) {
    next(err)
  }
})

bookmarksRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    const bookmark = await bookmarkService.get(userId, req.params.id)
    res.json(ok(bookmark, req.requestId!))
  } catch (err) {
    next(err)
  }
})

bookmarksRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    const parsed = UpdateBookmarkSchema.safeParse(req.body)
    if (!parsed.success) throw new ValidationError('Invalid bookmark update')
    const bookmark = await bookmarkService.update(userId, req.params.id, parsed.data)
    res.json(ok(bookmark, req.requestId!))
  } catch (err) {
    next(err)
  }
})

bookmarksRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.auth!.sub
    await bookmarkService.remove(userId, req.params.id)
    res.json(ok({ id: req.params.id, deleted: true }, req.requestId!))
  } catch (err) {
    next(err)
  }
})
