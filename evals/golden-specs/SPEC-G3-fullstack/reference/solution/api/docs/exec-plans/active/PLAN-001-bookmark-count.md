# PLAN-001 — Bookmark Count Endpoint

**Spec:** docs/product-specs/ready/SPEC-001-bookmark-count.md
**Status:** ACTIVE

Implements the api/ slice of SPEC-G3-fullstack: the owner-scoped `GET /api/v1/bookmarks/count`
aggregate, registered in the OpenAPI contract so the frontend's generated types carry `count`.

## Layers

- [x] **types** — `BookmarkCountSchema` (`{ count: number }`) in `src/types/bookmark.types.ts`.
- [x] **repo** — `countForUser(userId)` in `src/repo/bookmark.repo.ts` (owner-scoped `count`).
- [x] **service** — `count(userId)` in `src/services/bookmark.service.ts` (span + structured log).
- [x] **runtime** — `GET /count` in `src/runtime/routes/v1/bookmarks.route.ts`, registered
  **before** `GET /:id` so `count` is not swallowed as an `:id` param.
- [x] **contract** — register `/bookmarks/count` in `src/runtime/openapi.ts` with a typed 200
  response body (`BookmarkCount` component).
- [x] **acceptance** — `tests/acceptance/SPEC-001/AC-1.test.ts`.

## Progress Log

### AC vector — SPEC-001 — 2026-07-23T18:10:47.880Z
- AC-1: PASS ✅
