---
paths:
  - "src/hooks/**/*.ts"
  - "src/hooks/**/*.tsx"
  - "src/lib/api-client.ts"
---

# API Contract Rules — Auto-injected on hook and api-client edits

## The Golden Rule
`api.generated.ts` is the contract. Every API call must flow through it.

## Canonical Wire Contract (cross-stack — FastAPI · Express · NestJS)

This frontend talks to any of the harness backends. They MUST agree on ONE wire shape
so the client never special-cases a backend. The agreed conventions:

- **Field naming: `snake_case`** on the wire (`next_cursor_id`, `has_more`, `created_at`).
  FastAPI/Pydantic emits this by default. Express/NestJS + Sequelize must emit it too
  (Sequelize `underscored: true`, or a response serializer) — do NOT ship camelCase.
- **List envelope (cursor pagination):**
  `{ "items": T[], "has_more": boolean, "next_cursor_id": string | null }`
  Request params: `cursor_id` (opaque), `limit` (int).
- **Error envelope (every non-2xx):**
  `{ "error": { "code": "SNAKE_CASE_CODE", "message": "human readable", "details"?: object } }`
  (Not FastAPI's bare `{ "detail": ... }` — backends register a handler that emits this.)

**How this is enforced mechanically (not just prose):** the field names you write in
hooks are checked against `api.generated.ts` by `tsc`. If a backend deviates (e.g. emits
`nextCursorId`), `/api-sync` regenerates camelCase types and `npm run typecheck` FAILS on
`lastPage.next_cursor_id` — the drift cannot pass the gate silently. Agreement across
templates + typecheck is the guard; keep the convention above in lock-step with the
Express/NestJS/FastAPI templates.

## Hook Pattern — Every Hook Must Follow This

```typescript
// src/hooks/use-applications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toApiError } from '@/lib/api-error'
import type { components } from '@/types/api.generated'

type Application = components['schemas']['ApplicationResponse']
type CreateApplicationInput = components['schemas']['CreateApplicationInput']

// ─── Query Keys ─────────────────────────────────────────
// Centralise all query keys — never use raw strings in components
export const applicationKeys = {
  all:    () => ['applications'] as const,
  lists:  () => [...applicationKeys.all(), 'list'] as const,
  list:   (filters: Record<string, unknown>) =>
            [...applicationKeys.lists(), filters] as const,
  detail: (id: string) => [...applicationKeys.all(), 'detail', id] as const,
}

// ─── List ────────────────────────────────────────────────
export function useApplications(filters?: { stage?: string; limit?: number }) {
  return useQuery({
    queryKey: applicationKeys.list(filters ?? {}),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/applications', {
        params: { query: filters },
      })
      if (error) throw toApiError(error, 'Failed to fetch applications')
      return data
    },
    staleTime: 60_000,  // 1 min — server data doesn't change every second
  })
}

// ─── Single ──────────────────────────────────────────────
export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/applications/{id}', {
        params: { path: { id } },
      })
      if (error) throw toApiError(error, `Application ${id} not found`)
      return data
    },
    enabled: !!id,  // don't fetch if no id
  })
}

// ─── Mutation ────────────────────────────────────────────
export function useCreateApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CreateApplicationInput) => {
      const { data, error } = await apiClient.POST('/api/v1/applications', { body })
      if (error) throw toApiError(error, 'Failed to create application')
      return data
    },
    onSuccess: () => {
      // Invalidate all application lists — triggers refetch
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}
```

## Error Handling in Hooks

Preserve the backend error — do NOT replace it with a hard-coded English string (that
throws away the `code`/`message` the canonical error envelope carries). Use a shared
helper that reads the envelope defensively:

```typescript
// src/lib/api-error.ts  (authored in Phase 0 glue)
export class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message)
  }
}
// Reads the canonical { error: { code, message } } envelope; falls back gracefully
// for a bare FastAPI { detail } or an opaque error so a message ALWAYS surfaces.
export function toApiError(error: unknown, fallback = 'Request failed'): ApiError {
  const e = error as { error?: { code?: string; message?: string; details?: unknown }; detail?: unknown }
  if (e?.error?.message) return new ApiError(e.error.code ?? 'unknown', e.error.message, e.error.details)
  if (typeof e?.detail === 'string') return new ApiError('unknown', e.detail)
  return new ApiError('unknown', fallback)
}
```

```typescript
// ✅ Throw the real error — code + message reach the UI
if (error) throw toApiError(error, 'Failed to fetch applications')

// ✅ Handle in component via isError + error (error.message is the backend message)
const { isError, error } = useApplications()
if (isError) return <ErrorState message={error.message} />

// ❌ Never swallow errors
const { data } = await apiClient.GET(...)
// missing: if (error) throw ...

// ❌ Never discard the backend error for a hard-coded string
if (error) throw new Error('Failed to fetch applications')  // loses code + real message
```

## staleTime Guidance
```typescript
// User-specific, changes often: staleTime: 30_000     (30s)
// Reference data, rarely changes: staleTime: 300_000   (5min)
// Static config: staleTime: Infinity
```

## Pagination with Cursor
```typescript
export function useApplications(cursor?: string) {
  return useInfiniteQuery({
    queryKey: applicationKeys.list({ cursor }),
    queryFn: async ({ pageParam }) => {
      const { data, error } = await apiClient.GET('/api/v1/applications', {
        params: { query: { cursor_id: pageParam, limit: 20 } },
      })
      if (error) throw error
      return data
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor_id ?? undefined,
    initialPageParam: undefined,
  })
}
```
