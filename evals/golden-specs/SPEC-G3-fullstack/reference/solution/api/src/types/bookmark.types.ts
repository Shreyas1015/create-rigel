/**
 * Bookmark domain types + Zod schemas (Types layer — zero imports from other layers).
 *
 * `BookmarkSchema` is the DB-row shape the repo validates every result against;
 * `PublicBookmarkSchema` is the projection returned to clients (drops the paranoid
 * `deletedAt`). `CreateBookmarkSchema` / `UpdateBookmarkSchema` are the request bodies
 * parsed at the route boundary. Field limits live here (Types may not import Config).
 */
import { z } from 'zod'

/** Reading lifecycle. New bookmarks default to `unread`; PATCH may move freely among these. */
export const BOOKMARK_STATUSES = ['unread', 'reading', 'archived'] as const
export const BookmarkStatusSchema = z.enum(BOOKMARK_STATUSES)
export type BookmarkStatus = z.infer<typeof BookmarkStatusSchema>

/** Field bounds (SPEC-002 business rules). */
export const MAX_URL_LENGTH = 2048
export const MAX_TITLE_LENGTH = 512
export const MAX_TAG_LENGTH = 50
export const MAX_TAGS = 20

const TagsSchema = z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS)

/** Full persisted row (shape of `Bookmark.model` `.toJSON()`). */
export const BookmarkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  tags: z.array(z.string()),
  status: BookmarkStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})
export type Bookmark = z.infer<typeof BookmarkSchema>

/** Safe projection returned to clients — drops the paranoid `deletedAt`. */
export const PublicBookmarkSchema = BookmarkSchema.omit({ deletedAt: true })
export type PublicBookmark = z.infer<typeof PublicBookmarkSchema>

/** Create request body. `status` is not accepted — new bookmarks are always `unread`. */
export const CreateBookmarkSchema = z.object({
  url: z.url().max(MAX_URL_LENGTH),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
  note: z.string().optional(),
  tags: TagsSchema.optional().default([]),
})
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkSchema>

/** Update (PATCH) request body — every field optional; unknown `status` values are rejected. */
export const UpdateBookmarkSchema = z
  .object({
    title: z.string().min(1).max(MAX_TITLE_LENGTH),
    note: z.string().nullable(),
    tags: TagsSchema,
    status: BookmarkStatusSchema,
  })
  .partial()
export type UpdateBookmarkInput = z.infer<typeof UpdateBookmarkSchema>

/** Optional list filters (validated at the route, applied owner-scoped in the repo). */
export interface ListBookmarksFilter {
  status?: BookmarkStatus
  tag?: string
}

/**
 * Aggregate count response body (SPEC-G3 AC-1). This is the `data` payload of the
 * `GET /bookmarks/count` envelope. It is registered as a named OpenAPI component in
 * `src/runtime/openapi.ts` so the frontend's generated types carry the `count` field —
 * the badge's number is typed from the contract, never hand-defined (SPEC-G3 AC-2).
 */
export const BookmarkCountSchema = z.object({
  count: z.number().int().nonnegative(),
})
export type BookmarkCount = z.infer<typeof BookmarkCountSchema>
