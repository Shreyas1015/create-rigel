// SPEC-001 (golden SPEC-G2) — AC-3 acceptance test (holdout).
// AC-3: while the query is pending a skeleton placeholder is shown; when the list is empty
// an empty-state message is shown. Fails RED pre-implementation (feature import unresolved).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { BookmarkList } from '@/features/bookmarks/bookmark-list'

describe('AC-3: loading skeleton and empty state', () => {
  it('AC-3: shows a skeleton placeholder while the bookmarks query is pending', () => {
    server.use(
      http.get('*/api/v1/bookmarks', async () => {
        await delay('infinite') // keep the query pending for the duration of the test
        return HttpResponse.json({ items: [], has_more: false, next_cursor_id: null })
      })
    )

    render(<BookmarkList />, { wrapper: createWrapper() })

    // Skeleton region is present immediately (query is pending), before any data resolves.
    expect(screen.getByRole('status', { name: /loading bookmarks/i })).toBeInTheDocument()
    // And the empty-state copy is NOT what we show while loading.
    expect(screen.queryByText(/no bookmarks yet/i)).not.toBeInTheDocument()
  })

  it('AC-3: shows an empty-state message when the list is empty', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor_id: null })
      )
    )

    render(<BookmarkList />, { wrapper: createWrapper() })

    expect(await screen.findByText(/no bookmarks yet/i)).toBeInTheDocument()
  })
})
