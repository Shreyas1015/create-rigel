/**
 * Bookmark service (Service layer — business logic; no express/HTTP, no provider imports).
 *
 * Orchestrates owner-scoped create / list / delete over the repo and returns domain
 * `PublicBookmark` values (the ORM `updatedAt` and paranoid `deletedAt` never leave here). A
 * missing or non-owned row on delete becomes a `NotFoundError` → the route responds 404 (never
 * 403 — cross-user isolation). Every boundary emits a span + a structured log with `durationMs`.
 */
import { logger } from '../config/logger.js'
import { withSpan } from '../config/tracing.js'
import * as bookmarkRepo from '../repo/bookmark.repo.js'
import {
  PublicBookmarkSchema,
  type CreateBookmarkInput,
  type PublicBookmark,
} from '../types/bookmark.types.js'
import type { PageCursor, PageResult } from '../types/common.types.js'
import { NotFoundError } from '../utils/errors.util.js'

interface ListOptions {
  cursor?: PageCursor
  limit?: number
}

/** Create a bookmark owned by the caller; returns the safe projection. */
export async function create(userId: string, input: CreateBookmarkInput): Promise<PublicBookmark> {
  return withSpan('bookmark.create', {}, async () => {
    const start = Date.now()
    const row = await bookmarkRepo.create(userId, input)
    logger.info({
      event: 'bookmark.create',
      userId,
      bookmarkId: row.id,
      durationMs: Date.now() - start,
    })
    return PublicBookmarkSchema.parse(row)
  })
}

/** List the caller's bookmarks, newest-first, cursor-paginated. */
export async function list(
  userId: string,
  opts: ListOptions = {}
): Promise<PageResult<PublicBookmark>> {
  return withSpan('bookmark.list', {}, async () => {
    const start = Date.now()
    const page = await bookmarkRepo.list(userId, opts)
    logger.info({
      event: 'bookmark.list',
      userId,
      count: page.items.length,
      durationMs: Date.now() - start,
    })
    return {
      items: page.items.map((r) => PublicBookmarkSchema.parse(r)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    }
  })
}

/** Delete an owned bookmark; 404 when it is absent or not the caller's. */
export async function remove(userId: string, id: string): Promise<void> {
  return withSpan('bookmark.delete', {}, async () => {
    const start = Date.now()
    const deleted = await bookmarkRepo.softDelete(id, userId)
    if (!deleted) throw new NotFoundError('Bookmark not found')
    logger.info({
      event: 'bookmark.delete',
      userId,
      bookmarkId: id,
      durationMs: Date.now() - start,
    })
  })
}
