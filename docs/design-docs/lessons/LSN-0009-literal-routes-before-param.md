---
id: LSN-0009
summary: "Register literal sub-paths (/count, /search) before parameterized routes (/:id), or the param shadows them."
status: DISTILLED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: null
---
## What went wrong
`GET /bookmarks/count` was matched by `GET /bookmarks/:id` as `id="count"` and 404'd, unless the
literal route was registered first (DF-48). The frontend silently received a 404-shaped error.

## Why it happens
Express matches routes in registration order; a parameterized segment greedily captures any literal
that comes after it.

## The rule
On a router, declare literal/aggregate sub-paths before `/:id`. It's standard behavior but a real
trap for "add an aggregate endpoint" tasks.
