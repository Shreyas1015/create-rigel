# SPEC-001 — Bookmark Count Badge (web slice of SPEC-G3-fullstack)

**Status:** READY
**Stack:** nextjs (web/)
**Plan:** PLAN-001
**Depends on:** the api's generated OpenAPI contract (`openapi.json`) providing `GET /bookmarks/count`.

> Harness-id note: the eval harness resolves spec ids as `SPEC-\d+` (see
> `scripts/lib/rigel-evals.mjs` + `tests/architecture/traceability.test.ts`), so the golden
> spec `SPEC-G3-fullstack` is graded under the numeric id **SPEC-001** in this app. The content
> below is the **web/** slice of SPEC-G3 — the frontend badge that consumes the contract. The
> api/ slice (SPEC-G3 AC-1) is graded in the sibling express app under its own SPEC-001. AC-4
> (both gates + contract up to date) is graded across both apps.

---

## Problem Statement

A user needs a header badge showing how many bookmarks they have. The badge's number comes from
the backend `GET /bookmarks/count` endpoint, consumed through a typed hook over the generated
API contract.

## What We're Building

- `src/hooks/use-bookmark-count.ts` — a TanStack Query hook over the typed api-client whose
  response type is imported from the generated contract (`src/types/api.generated.ts`).
- `src/features/bookmarks/bookmark-count-badge.tsx` — a `'use client'` feature that reads the
  count via that hook (no direct `fetch()`), rendering `0` (not blank) for an empty user.

## Business Rules

1. The frontend type for the response is generated from the API's OpenAPI spec — no hand-typed shape.
2. All API access goes through `src/hooks/` — no `fetch()` in components/features/pages.
3. The badge shows `0` correctly (not blank) when the user has no bookmarks.

## Non-Functional Requirements

- The contract is regenerated (`/api-sync`) so `src/types/api.generated.ts` matches the live endpoint.
- Frontend gate passes (`npm run gate`).

## Out of Scope (v1)

Realtime updates; caching beyond TanStack defaults; pagination.

## Acceptance Criteria

- [ ] **AC-2:** the frontend response type is imported from the generated contract
      (`src/types/api.generated.ts`) — the hook references the generated `BookmarkCountResponse`
      and does not hand-define the response shape.
- [ ] **AC-3:** `BookmarkCountBadge` renders the count via the `useBookmarkCount` hook
      (no direct `fetch()`), and renders `0` (not empty) for a user with no bookmarks.
