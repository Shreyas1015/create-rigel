# SPEC-G1 — Bookmarks API (golden, backend-heavy)

**Status:** READY (frozen golden spec — do not edit; changing it invalidates baselines)
**Stack:** express
**Plan:** golden-set trial only

---

## Problem Statement

A user needs to save, list, and delete personal bookmarks (a URL + title). Each user sees
only their own bookmarks. This is the smallest spec that exercises the full backend layer
stack (types → models → repo → service → runtime) plus the cross-user isolation contract.

## What We're Building

A `/api/v1/bookmarks` resource: create, list (cursor-paginated), delete — all scoped to the
authenticated user.

## Core Entities

| Entity | Purpose |
|---|---|
| Bookmark | `{ id, userId, url, title, createdAt }` — an owned resource (Sequelize model + Zod schema) |

## API Endpoints

- `POST /api/v1/bookmarks` — create `{ url, title }`, returns 201 with the created record
- `GET /api/v1/bookmarks?cursor=` — list the caller's bookmarks, newest first, cursor-paginated
- `DELETE /api/v1/bookmarks/:id` — delete one the caller owns

## Business Rules

1. All endpoints require authentication.
2. `url` must be a valid http(s) URL; `title` is 1–200 chars. Invalid input → 422.
3. A user may only read/delete their own bookmarks; another user's id → 404 (never 403).
4. Listing uses cursor pagination on `(createdAt, id)` — never offset.

## Non-Functional Requirements

- Standard response envelope (`data` + `meta.requestId`).
- Repo returns are Zod-parsed; no raw ORM rows escape the repo layer.

## Out of Scope (v1)

Editing a bookmark; tags; sharing; search.

## Acceptance Criteria

- [ ] **AC-1:** `POST /api/v1/bookmarks` with a valid body and auth returns 201 and a body whose `data` has an `id` and the submitted `url`.
- [ ] **AC-2:** any endpoint called without an auth token returns 401.
- [ ] **AC-3:** user B requesting or deleting user A's bookmark id returns 404 (not 403).
- [ ] **AC-4:** `GET /api/v1/bookmarks` returns a cursor (`meta.nextCursor`) and the repo uses no offset pagination.
