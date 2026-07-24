// SPEC-001 (golden SPEC-G2) — AC-1 acceptance test (holdout).
// AC-1: visiting /bookmarks renders a list whose items come from the useBookmarks hook
// (mocked via MSW). Fails RED pre-implementation (the feature import does not resolve).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { BookmarkList } from '@/features/bookmarks/bookmark-list'

const bookmarks = [
  {
    id: '018f0000-0000-7000-8000-000000000001',
    user_id: '018f0000-0000-7000-8000-0000000000aa',
    url: 'https://nextjs.org/docs',
    title: 'Next.js Docs',
    created_at: '2026-07-20T10:00:00.000Z',
  },
  {
    id: '018f0000-0000-7000-8000-000000000002',
    user_id: '018f0000-0000-7000-8000-0000000000aa',
    url: 'https://tanstack.com/query',
    title: 'TanStack Query',
    created_at: '2026-07-21T10:00:00.000Z',
  },
]

describe('AC-1: bookmarks list comes from the useBookmarks hook (MSW-mocked)', () => {
  it('AC-1: renders one list item per bookmark returned by the API', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: bookmarks, has_more: false, next_cursor_id: null })
      )
    )

    render(<BookmarkList />, { wrapper: createWrapper() })

    // The titles from the mocked API surface in the UI…
    expect(await screen.findByText('Next.js Docs')).toBeInTheDocument()
    expect(screen.getByText('TanStack Query')).toBeInTheDocument()
    // …as an actual list, one item per hook-provided bookmark.
    expect(screen.getAllByRole('listitem')).toHaveLength(bookmarks.length)
  })
})
