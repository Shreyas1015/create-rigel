// src/app/bookmarks/page.tsx
// Server Component (no directive): layout + renders the BookmarkList feature. No business
// logic, no hooks, no fetch here — those live in the feature/hook layers.
import { BookmarkList } from '@/features/bookmarks/bookmark-list'

export default function BookmarksPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-foreground text-xl font-semibold">Bookmarks</h1>
      <BookmarkList />
    </main>
  )
}
