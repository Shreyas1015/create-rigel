/**
 * Bookmark repository (Repo layer — DB access only, every result Zod-validated).
 *
 * A Bookmark is an OWNED resource: every single-row read/update/delete is scoped
 * `where: { id, userId }` (never `findByPk` alone), so a non-owner sees `null` → the service
 * raises `NotFoundError` → the route responds 404 (never 403). `list` is keyset-paginated on
 * `(createdAt, id)` DESC. This is the first owned resource, so it ships a cross-user isolation
 * test (`tests/integration/bookmark.isolation.test.ts`) — enforced by tests/architecture/isolation.
 */
import { Op, type WhereOptions } from 'sequelize'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js'
import { Bookmark as BookmarkModel } from '../models/index.js'
import {
  BookmarkSchema,
  type Bookmark,
  type CreateBookmarkInput,
  type ListBookmarksFilter,
  type UpdateBookmarkInput,
} from '../types/bookmark.types.js'
import type { PageCursor, PageResult } from '../types/common.types.js'

/** Persist a new bookmark owned by `userId`. `status` defaults to 'unread' via the model. */
export async function create(userId: string, input: CreateBookmarkInput): Promise<Bookmark> {
  const row = await BookmarkModel.create({
    userId,
    url: input.url,
    title: input.title,
    note: input.note ?? null,
    tags: input.tags,
  })
  return BookmarkSchema.parse(row.toJSON())
}

/** Owner-scoped single-row lookup. Returns null when the row is absent or not the caller's. */
export async function findByIdForUser(id: string, userId: string): Promise<Bookmark | null> {
  const row = await BookmarkModel.findOne({ where: { id, userId } })
  return row ? BookmarkSchema.parse(row.toJSON()) : null
}

interface ListOptions {
  cursor?: PageCursor
  limit?: number
  filter?: ListBookmarksFilter
}

/** Owner-scoped, newest-first, keyset-paginated list with optional status/tag filters. */
export async function list(userId: string, opts: ListOptions = {}): Promise<PageResult<Bookmark>> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

  const conditions: WhereOptions[] = [{ userId }]
  if (opts.filter?.status) conditions.push({ status: opts.filter.status })
  if (opts.filter?.tag) conditions.push({ tags: { [Op.contains]: [opts.filter.tag] } })
  if (opts.cursor) {
    const at = new Date(opts.cursor.createdAt)
    conditions.push({
      [Op.or]: [
        { createdAt: { [Op.lt]: at } },
        { [Op.and]: [{ createdAt: at }, { id: { [Op.lt]: opts.cursor.id } }] },
      ],
    })
  }

  const rows = await BookmarkModel.findAll({
    where: { [Op.and]: conditions },
    order: [
      ['createdAt', 'DESC'],
      ['id', 'DESC'],
    ],
    limit: limit + 1,
  })

  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => BookmarkSchema.parse(r.toJSON()))
  const last = items.at(-1)
  const nextCursor: PageCursor | null =
    hasMore && last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null

  return { items, nextCursor, hasMore }
}

/**
 * Owner-scoped update. Returns the updated row, or null when no owned row matched.
 * `patch` must be non-empty (the service short-circuits an empty patch to a plain read).
 */
export async function update(
  id: string,
  userId: string,
  patch: UpdateBookmarkInput
): Promise<Bookmark | null> {
  const [count, rows] = await BookmarkModel.update(patch, {
    where: { id, userId },
    returning: true,
  })
  if (count === 0) return null
  return BookmarkSchema.parse(rows[0]!.toJSON())
}

/** Owner-scoped soft delete (paranoid → sets deletedAt). True when a row was deleted. */
export async function softDelete(id: string, userId: string): Promise<boolean> {
  const count = await BookmarkModel.destroy({ where: { id, userId } })
  return count > 0
}

/**
 * Owner-scoped aggregate: how many (non-deleted) bookmarks the caller owns. `count` on a
 * paranoid model excludes soft-deleted rows automatically, and the `where: { userId }` scope
 * keeps it caller-only — another user's rows never contribute (SPEC-G3 AC-1).
 */
export async function countForUser(userId: string): Promise<number> {
  return BookmarkModel.count({ where: { userId } })
}
