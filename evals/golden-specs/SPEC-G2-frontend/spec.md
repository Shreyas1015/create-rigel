# SPEC-G2 — Bookmarks List Page (golden, frontend-heavy)

**Status:** READY (frozen golden spec — do not edit; changing it invalidates baselines)
**Stack:** nextjs
**Plan:** golden-set trial only
**Depends on:** a Bookmarks API contract (openapi.json) providing `GET /api/v1/bookmarks`

---

## Problem Statement

A user needs a page that lists their bookmarks. This is the smallest spec that exercises the
frontend layering (api-client → hook → feature → page), the "no direct fetch in components"
rule, an explicit loading state, and design-token conformance.

## What We're Building

A `/bookmarks` route: a server component page rendering a `BookmarkList` client feature that
reads data through a `useBookmarks` TanStack Query hook over the typed api-client.

## Core Components

| Unit | Purpose |
|---|---|
| `src/hooks/use-bookmarks.ts` | TanStack Query hook wrapping the typed api-client |
| `src/features/bookmarks/bookmark-list.tsx` | `'use client'` feature: list, loading, empty |
| `app/bookmarks/page.tsx` | server component rendering the feature |

## Business Rules

1. All API access goes through `src/hooks/` — no `fetch()` in components/features/pages.
2. While loading, a skeleton is shown; on empty, an empty-state message.
3. Styling uses design tokens only (colors/spacing/radii/type from DESIGN.md).

## Non-Functional Requirements

- Server/client component split respected; `'use client'` only where hooks are used.
- The page renders without console errors.

## Out of Scope (v1)

Creating/deleting from the UI; pagination controls; auth screens.

## Acceptance Criteria

- [ ] **AC-1:** visiting `/bookmarks` renders a list whose items come from the `useBookmarks` hook (mocked via MSW in the acceptance test).
- [ ] **AC-2:** no component/feature/page calls `fetch()` directly — all data flows through `src/hooks/`.
- [ ] **AC-3:** while the query is pending, a skeleton placeholder is shown; when the list is empty, an empty-state message is shown.
- [ ] **AC-4:** the rendered `/bookmarks` page passes design-token conformance (no off-token color/spacing/radius/type values).
