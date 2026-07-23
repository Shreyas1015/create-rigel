/**
 * Bookmark routes (Runtime layer). Handler order every time: auth → validate → service →
 * respond → next(err). `requireAuth` is mounted at the router level so every endpoint is
 * owner-scoped and an unauthenticated request is 401.
 *
 *   POST   /api/v1/bookmarks      201  create { url, title }
 *   GET    /api/v1/bookmarks      200  list (cursor-paginated on (createdAt,id); ?cursor= ?limit=)
 *   DELETE /api/v1/bookmarks/:id  200  delete one the caller owns (404 if not owner)
 *
 * Invalid request bodies are 422 VALIDATION_ERROR (safeParse → ValidationError): the global
 * ZodError handler maps to 400, so validation is done here to honour SPEC-G1's 422 rule.
 *
 * The list cursor is carried in `meta.nextCursor` (base64url JSON of `{ id, createdAt }`), per
 * SPEC-G1 AC-4 — the standard envelope is otherwise `{ data, meta: { requestId } }`.
 */
import { Router } from 'express'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../config/constants.js'
import { requireAuth } from '../../../providers/auth/middleware.js'
import * as bookmarkService from '../../../services/bookmark.service.js'
import { CreateBookmarkSchema } from '../../../types/bookmark.types.js'
import { PageCursorSchema, type PageCursor } from '../../../types/common.types.js'
import { ValidationError } from '../../../utils/errors.util.js'
import { ok } from '../../../utils/response.util.js'

export const bookmarksRouter: Router = Router()

// Auth first — applies to every route below; an unauthenticated request never reaches a handler.
bookmarksRouter.use(requireAuth)

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
    const page = await bookmarkService.list(userId, cursor ? { cursor, limit } : { limit })
    res.json({
      ok: true,
      data: page.items,
      meta: {
        requestId: req.requestId!,
        timestamp: new Date().toISOString(),
        nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      },
    })
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
