'use client' // Client: uses the useBookmarks TanStack Query hook (browser-side data fetching).

// src/features/bookmarks/bookmark-list.tsx
// Renders the bookmarks list with all four data states — loading (skeleton), error, empty,
// and populated. Data comes exclusively from the useBookmarks hook (no direct fetch). Styling
// uses design tokens only (semantic @theme utilities); no arbitrary values.
import { useBookmarks } from '@/hooks/use-bookmarks'
import { Skeleton } from '@/components/ui/skeleton'

export function BookmarkList() {
  const { data, isPending, isError, error } = useBookmarks()

  if (isPending) {
    return (
      <div role="status" aria-label="Loading bookmarks" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div
        role="alert"
        className="border-destructive bg-background text-destructive rounded-md border p-4"
      >
        <p className="text-sm font-medium">Couldn&rsquo;t load your bookmarks</p>
        <p className="text-sm">{error.message}</p>
      </div>
    )
  }

  if (data.items.length === 0) {
    return (
      <div className="border-border bg-muted rounded-md border p-8 text-center">
        <p className="text-foreground text-base font-medium">No bookmarks yet</p>
        <p className="text-foreground text-sm">Save a link and it will show up here.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.items.map((bookmark) => (
        <li key={bookmark.id} className="border-border bg-background rounded-md border p-4">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary focus-visible:ring-primary text-base font-medium underline-offset-4 hover:underline focus-visible:ring-2"
          >
            {bookmark.title}
          </a>
          <p className="text-foreground text-sm">{bookmark.url}</p>
        </li>
      ))}
    </ul>
  )
}
