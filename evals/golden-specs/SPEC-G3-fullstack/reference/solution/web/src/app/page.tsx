import { BookmarkCountBadge } from '@/features/bookmarks/bookmark-count-badge'

export default function Home() {
  return (
    <main className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <header className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Bookmarks</h1>
        <BookmarkCountBadge />
      </header>
      <p className="text-base">A header badge showing how many bookmarks you have.</p>
    </main>
  )
}
