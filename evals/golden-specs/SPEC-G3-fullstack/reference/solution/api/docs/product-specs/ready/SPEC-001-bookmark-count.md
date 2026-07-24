# SPEC-001 — Bookmark Count Endpoint (api slice of SPEC-G3-fullstack)

**Status:** READY
**Stack:** express (api/)
**Plan:** PLAN-001

> Harness-id note: the eval harness resolves spec ids as `SPEC-\d+` (see
> `scripts/lib/rigel-evals.mjs` + `tests/architecture/traceability.test.ts`), so the golden
> spec `SPEC-G3-fullstack` is graded under the numeric id **SPEC-001** in this app. The content
> below is the **api/** slice of SPEC-G3 — the backend aggregate endpoint. The web/ slice
> (SPEC-G3 AC-2/AC-3) is graded in the sibling nextjs app under its own SPEC-001. AC-4 (both
> gates + contract up to date) is graded across both apps.

---

## Problem Statement

A user needs a header badge showing how many bookmarks they have. The badge's number comes from
a backend aggregate endpoint. This spec covers that endpoint: `GET /api/v1/bookmarks/count`.

## What We're Building

- `GET /api/v1/bookmarks/count` returning `{ count }` for the authenticated caller.

The endpoint is owner-scoped: it counts only the caller's (non-deleted) bookmarks. It is
registered in the OpenAPI contract with a typed `200` response body so the frontend's generated
types (`api.generated.ts`) carry the `count` field (no hand-typed shape).

## Business Rules

1. The count endpoint requires auth and counts only the caller's bookmarks.
2. Soft-deleted bookmarks are excluded (the model is paranoid).
3. The 200 response follows the canonical envelope `{ ok, data: { count }, meta }`.

## Non-Functional Requirements

- The count path is registered in `src/runtime/openapi.ts` with a response content schema so
  `npm run openapi:export` emits a typed `BookmarkCount` component.
- Backend gate passes (`npm run gate`).

## Out of Scope (v1)

Realtime updates; caching beyond defaults; per-status/per-tag counts.

## Acceptance Criteria

- [ ] **AC-1:** `GET /api/v1/bookmarks/count` with auth returns 200 and `data.count` equal to the
  caller's bookmark count (0 for a new user; N after creating N; another user's bookmarks are not counted).
