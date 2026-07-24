// src/hooks/use-bookmark-count.ts
// TanStack Query hook for the bookmark count. The response type is IMPORTED from the generated
// OpenAPI contract (src/types/api.generated.ts) — never hand-defined (SPEC-G3 AC-2). All API
// access flows through the typed api-client here in the hooks layer (no fetch() in components).
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toApiError } from '@/lib/api-error'
import type { components } from '@/types/api.generated'

// The count endpoint's response envelope, straight from the generated contract.
type BookmarkCountResponse = components['schemas']['BookmarkCountResponse']
// The badge's number type — the `data` payload of that generated envelope (`{ count: number }`).
export type BookmarkCount = BookmarkCountResponse['data']

/** Query-key factory so callers/invalidators share one canonical key (cf. G2's use-bookmarks). */
export const bookmarkCountKeys = {
  all: ['bookmarks', 'count'] as const,
}

/** Read the authenticated caller's bookmark count through the typed contract. */
export function useBookmarkCount(): UseQueryResult<BookmarkCount> {
  return useQuery<BookmarkCount>({
    queryKey: bookmarkCountKeys.all,
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/bookmarks/count')
      if (error || !data) throw toApiError(error)
      return data.data
    },
  })
}
