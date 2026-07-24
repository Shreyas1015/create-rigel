# PLAN-001 — Bookmark Count Badge

**Spec:** docs/product-specs/ready/SPEC-001-bookmark-count-badge.md
**Status:** ACTIVE

Implements the web/ slice of SPEC-G3-fullstack: a typed hook + a `'use client'` badge feature
consuming the generated `GET /bookmarks/count` contract, rendering `0` for an empty user.

## Layers

- [x] **lib** — `src/lib/env.ts`, `src/lib/api-client.ts` (openapi-fetch, lazy fetch for MSW).
- [x] **types** — `src/types/api.generated.ts` regenerated via `/api-sync` from the api contract.
- [x] **hooks** — `src/hooks/use-bookmark-count.ts` (TanStack Query; response type imported from
      the generated contract — SPEC-G3 AC-2).
- [x] **features** — `src/features/bookmarks/bookmark-count-badge.tsx` (`'use client'`; reads the
      hook; renders `0` not blank — SPEC-G3 AC-3).
- [x] **app** — badge wired into the home header via the feature; `Providers` in the layout.
- [x] **acceptance** — `tests/acceptance/SPEC-001/AC-2.test.ts`, `AC-3.test.tsx`.

## Progress Log

### AC vector — SPEC-001 — 2026-07-24T14:59:36.422Z

- AC-2: PASS ✅
- AC-3: PASS ✅
