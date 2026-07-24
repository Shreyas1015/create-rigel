/**
 * Bookmark service (Service layer — business logic; no express/HTTP, no provider imports).
 *
 * Orchestrates owner-scoped CRUD over the repo and returns domain `PublicBookmark` values
 * (the paranoid `deletedAt` never leaves here). A missing or non-owned row becomes a
 * `NotFoundError` → the route responds 404 (never 403 — cross-user isolation). Every boundary
 * emits a span + a structured log with `durationMs`.
 */
import { logger } from '../config/logger.js'
import { withSpan } from '../config/tracing.js'
import * as bookmarkRepo from '../repo/bookmark.repo.js'
import {
  BookmarkCountSchema,
  PublicBookmarkSchema,
  type BookmarkCount,
  type CreateBookmarkInput,
  type ListBookmarksFilter,
  type PublicBookmark,
  type UpdateBookmarkInput,
} from '../types/bookmark.types.js'
import type { PageCursor, PageResult } from '../types/common.types.js'
import { NotFoundError } from '../utils/errors.util.js'

interface ListOptions {
  cursor?: PageCursor
  limit?: number
  filter?: ListBookmarksFilter
}

/** Create a bookmark owned by the caller; returns the safe projection (status defaults to unread). */
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

/** Fetch one owned bookmark; 404 when it is absent or not the caller's (never reveal existence). */
export async function get(userId: string, id: string): Promise<PublicBookmark> {
  const row = await bookmarkRepo.findByIdForUser(id, userId)
  if (!row) throw new NotFoundError('Bookmark not found')
  logger.info({ event: 'bookmark.get', userId, bookmarkId: id })
  return PublicBookmarkSchema.parse(row)
}

/** List the caller's bookmarks, newest-first, cursor-paginated, with optional filters. */
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

/** Update an owned bookmark; 404 when not the caller's. An empty patch is a no-op read. */
export async function update(
  userId: string,
  id: string,
  patch: UpdateBookmarkInput
): Promise<PublicBookmark> {
  return withSpan('bookmark.update', {}, async () => {
    const start = Date.now()
    if (Object.keys(patch).length === 0) {
      const current = await bookmarkRepo.findByIdForUser(id, userId)
      if (!current) throw new NotFoundError('Bookmark not found')
      return PublicBookmarkSchema.parse(current)
    }
    const row = await bookmarkRepo.update(id, userId, patch)
    if (!row) throw new NotFoundError('Bookmark not found')
    logger.info({
      event: 'bookmark.update',
      userId,
      bookmarkId: id,
      durationMs: Date.now() - start,
    })
    return PublicBookmarkSchema.parse(row)
  })
}

/** Count the caller's bookmarks (owner-scoped aggregate; excludes soft-deleted). SPEC-G3 AC-1. */
export async function count(userId: string): Promise<BookmarkCount> {
  return withSpan('bookmark.count', {}, async () => {
    const start = Date.now()
    const total = await bookmarkRepo.countForUser(userId)
    logger.info({ event: 'bookmark.count', userId, count: total, durationMs: Date.now() - start })
    return BookmarkCountSchema.parse({ count: total })
  })
}

/** Soft-delete an owned bookmark; 404 when not the caller's. */
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
