/**
 * Bookmark domain types + Zod schemas (Types layer — zero imports from other layers except zod).
 *
 * `BookmarkSchema` is the DB-row shape the repo validates every result against;
 * `PublicBookmarkSchema` is the projection returned to clients — exactly the spec's field set
 * `{ id, userId, url, title, createdAt }` (the paranoid `deletedAt` and the ORM `updatedAt`
 * never leave the repo/service). `CreateBookmarkSchema` is the request body parsed at the route
 * boundary. Field limits live here (Types may not import Config).
 */
import { z } from 'zod'

/** Field bounds (SPEC-G1 business rule 2: url ≤ 2048; title 1–200). */
export const MAX_URL_LENGTH = 2048
export const MAX_TITLE_LENGTH = 200

/** Full persisted row (shape of `Bookmark.model` `.toJSON()`). */
export const BookmarkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
})
export type Bookmark = z.infer<typeof BookmarkSchema>

/** Safe projection returned to clients — exactly the spec's `{ id, userId, url, title, createdAt }`. */
export const PublicBookmarkSchema = BookmarkSchema.omit({ updatedAt: true, deletedAt: true })
export type PublicBookmark = z.infer<typeof PublicBookmarkSchema>

/**
 * Create request body. `url` must be a valid http(s) URL (business rule 2 — non-http(s) schemes
 * such as `ftp://`/`javascript:` are rejected); `title` is 1–200 chars. A failed parse becomes a
 * 422 VALIDATION_ERROR at the route.
 */
export const CreateBookmarkSchema = z.object({
  url: z
    .url()
    .max(MAX_URL_LENGTH)
    .refine((u) => /^https?:\/\//i.test(u), { message: 'url must use http or https' }),
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
})
export type CreateBookmarkInput = z.infer<typeof CreateBookmarkSchema>
