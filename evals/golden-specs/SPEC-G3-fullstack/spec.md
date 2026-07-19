# SPEC-G3 — Bookmark Count Badge (golden, full-stack)

**Status:** READY (frozen golden spec — do not edit; changing it invalidates baselines)
**Stack:** express (api/) + nextjs (web/)
**Plan:** golden-set trial only

---

## Problem Statement

A user needs a header badge showing how many bookmarks they have. This is the smallest spec
that crosses the full contract boundary: a backend aggregate endpoint, the OpenAPI contract
synced to typed frontend types, and a frontend component consuming it through a hook.

## What We're Building

- **api/** (express): `GET /api/v1/bookmarks/count` returning `{ count }` for the caller.
- **web/** (nextjs): a `BookmarkCountBadge` reading the count via a typed hook and rendering it.

The vertical slice must stay type-safe across the boundary: the frontend's number comes from
the generated contract (`/api-sync`), not a hand-written type.

## Business Rules

1. The count endpoint requires auth and counts only the caller's bookmarks.
2. The frontend type for the response is generated from the API's OpenAPI spec (no hand-typed shape).
3. The badge shows `0` correctly (not blank) when the user has no bookmarks.

## Non-Functional Requirements

- The contract is regenerated (`/api-sync`) so `api.generated.ts` matches the live endpoint.
- Backend gate + frontend gate both pass on their respective apps.

## Out of Scope (v1)

Realtime updates; caching strategy beyond TanStack defaults; pagination.

## Acceptance Criteria

- [ ] **AC-1:** `GET /api/v1/bookmarks/count` with auth returns 200 and `data.count` equal to the caller's bookmark count.
- [ ] **AC-2:** the frontend response type is imported from the generated contract (`src/types/api.generated.ts`), not hand-defined.
- [ ] **AC-3:** `BookmarkCountBadge` renders the count via a hook (no direct `fetch()`), and renders `0` (not empty) for a user with no bookmarks.
- [ ] **AC-4:** both apps pass their gate (`npm run gate` in api/ and web/) and the API's OpenAPI contract is up to date.
