# PLAN-001 — Bookmarks API (SPEC-G1 golden reference)

**Status:** IN_PROGRESS
**Spec:** docs/product-specs/ready/SPEC-001-bookmarks.md
**Created:** 2026-07-23
**Completed:** —

---

## Goal
Deliver the owner-scoped `/api/v1/bookmarks` resource (create / list / delete) with cursor
pagination on `(createdAt, id)` and the cross-user isolation contract — the smallest feature
that exercises the full backend layer stack (types → models → repo → service → runtime).

---

## Layer Build Order

`/build-layer` builds these **in order**, finds the first unchecked `- [ ]` item, and ticks its
box once that layer's gate passes.

- [ ] Layer 1: Types — `src/types/bookmark.types.ts` (Zod schemas: full row, public projection, create body); reuse `common.types.ts` cursor shapes (zero imports, zero logic)
- [ ] Layer 3: Models — `src/models/Bookmark.model.ts` (paranoid, UUIDv7, `(user_id, created_at, id)` index) + register in `models/index.ts`
- [ ] Layer 4: Migrations — `db/migrations/YYYYMMDD-create-bookmarks.cjs` (runs clean, has down())
- [ ] Layer 5: Repo — `src/repo/bookmark.repo.ts` (Zod parse every row, keyset cursor pagination, owner-scoped `where {id,userId}`, no offset) + `tests/integration/bookmark.isolation.test.ts`
- [ ] Layer 6: Service — `src/services/bookmark.service.ts` (no express imports; NotFoundError → 404; PublicBookmark projection)
- [ ] Layer 7: Runtime — `src/runtime/routes/v1/bookmarks.route.ts` (requireAuth first, 422 on invalid body, `meta.nextCursor` envelope) + mount in `app.ts` + register paths in `openapi.ts`
- [ ] Layer 9: Tests — acceptance suite green + integration + isolation

---

## Acceptance Criteria
{Copy from spec — these become the final gate}
- [ ] AC-1: `POST /api/v1/bookmarks` with a valid body and auth returns 201 and a body whose `data` has an `id` and the submitted `url`.
- [ ] AC-2: any endpoint called without an auth token returns 401.
- [ ] AC-3: user B requesting or deleting user A's bookmark id returns 404 (not 403).
- [ ] AC-4: `GET /api/v1/bookmarks` returns a cursor (`meta.nextCursor`) and the repo uses no offset pagination.

---

## Progress Log

### 2026-07-23 — Plan created
- Spec SPEC-001 (SPEC-G1) confirmed READY
- Acceptance tests scaffolded + proven RED (.rigel/redgreen/SPEC-001.json)
- 6 build layers planned (Config/Workers not applicable)

---

## Decision Log

- Auth is provided by the Phase-0 `providers/auth` scaffold (jose JWT + `requireAuth`); G1 signs
  access tokens directly in tests rather than adding register/login routes (out of G1 scope).
- Bookmarks table carries no FK to a users table (G1 has no users table); isolation is enforced
  purely by owner-scoped `userId` queries in the repo.
- List cursor is carried in `meta.nextCursor` (base64url JSON of `{id, createdAt}`), per SPEC-G1 AC-4.

---

## Known Constraints
- Public projection is exactly `{ id, userId, url, title, createdAt }` (the spec's field set); the
  model's `updatedAt`/`deletedAt` never leave the repo/service layer.
- `title` 1–200 chars; `url` a valid http(s) URL — invalid input → 422 (VALIDATION_ERROR).

### AC vector — SPEC-001 — 2026-07-23T17:41:48.846Z
- AC-1: PASS ✅
- AC-2: PASS ✅
- AC-3: PASS ✅
- AC-4: PASS ✅
