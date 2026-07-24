'use client' // Client feature: reads data via the useBookmarkCount TanStack Query hook.
import { Badge } from '@/components/ui/badge'
import { useBookmarkCount } from '@/hooks/use-bookmark-count'

/**
 * Header badge showing how many bookmarks the caller has. The number comes from the
 * `useBookmarkCount` hook (no direct fetch). A resolved count of 0 renders as "0" — never a
 * blank badge (SPEC-G3 AC-3); the placeholders below only show while genuinely loading or errored.
 * Styling uses design-token utilities via the shadcn Badge (variant), no arbitrary values.
 */
export function BookmarkCountBadge() {
  const query = useBookmarkCount()

  if (query.isPending) {
    return (
      <Badge
        variant="secondary"
        aria-label="Loading bookmark count"
        data-testid="bookmark-count-badge"
      >
        …
      </Badge>
    )
  }
  if (query.isError) {
    return (
      <Badge
        variant="destructive"
        aria-label="Bookmark count unavailable"
        data-testid="bookmark-count-badge"
      >
        —
      </Badge>
    )
  }
  return (
    <Badge aria-label={`${query.data.count} bookmarks`} data-testid="bookmark-count-badge">
      {query.data.count}
    </Badge>
  )
}
