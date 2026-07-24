// src/hooks/use-bookmarks.ts
// The ONLY data path for bookmarks: a TanStack Query hook over the typed openapi-fetch
// client. Features/pages call this — never the api-client, never fetch() directly.
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toApiError } from '@/lib/api-error'
import type { components } from '@/types/api.generated'

export type Bookmark = components['schemas']['Bookmark']
export type BookmarkList = components['schemas']['BookmarkList']

// ─── Query Keys ─────────────────────────────────────────
// Centralised so components never hand-write raw key strings.
export const bookmarkKeys = {
  all: () => ['bookmarks'] as const,
  lists: () => [...bookmarkKeys.all(), 'list'] as const,
  list: (filters: Record<string, unknown>) => [...bookmarkKeys.lists(), filters] as const,
}

// ─── List ────────────────────────────────────────────────
export function useBookmarks(filters?: { limit?: number }) {
  return useQuery({
    queryKey: bookmarkKeys.list(filters ?? {}),
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/api/v1/bookmarks', {
        params: { query: filters ?? {} },
      })
      if (error) throw toApiError(error, 'Failed to load bookmarks')
      return data
    },
    staleTime: 60_000, // server data doesn't change every second
  })
}
