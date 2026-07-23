/**
 * Bookmark repository (Repo layer — DB access only, every result Zod-validated).
 *
 * A Bookmark is an OWNED resource: every single-row read/delete is scoped `where: { id, userId }`
 * (never `findByPk` alone), so a non-owner sees `null` → the service raises `NotFoundError` → the
 * route responds 404 (never 403). `list` is keyset-paginated on `(createdAt, id)` DESC — never
 * offset. This owned resource ships a cross-user isolation test
 * (`tests/integration/bookmark.isolation.test.ts`), enforced by tests/architecture/isolation.
 */
import { Op, type WhereOptions } from 'sequelize'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants.js'
import { Bookmark as BookmarkModel } from '../models/index.js'
import { BookmarkSchema, type Bookmark, type CreateBookmarkInput } from '../types/bookmark.types.js'
import type { PageCursor, PageResult } from '../types/common.types.js'

/** Persist a new bookmark owned by `userId`. */
export async function create(userId: string, input: CreateBookmarkInput): Promise<Bookmark> {
  const row = await BookmarkModel.create({
    userId,
    url: input.url,
    title: input.title,
  })
  return BookmarkSchema.parse(row.toJSON())
}

interface ListOptions {
  cursor?: PageCursor
  limit?: number
}

/** Owner-scoped, newest-first, keyset-paginated list (no offset). */
export async function list(userId: string, opts: ListOptions = {}): Promise<PageResult<Bookmark>> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

  const conditions: WhereOptions[] = [{ userId }]
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

/** Owner-scoped soft delete (paranoid → sets deletedAt). True when a row was deleted. */
export async function softDelete(id: string, userId: string): Promise<boolean> {
  const count = await BookmarkModel.destroy({ where: { id, userId } })
  return count > 0
}
