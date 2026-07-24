import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse, delay } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { BookmarkList } from '@/features/bookmarks/bookmark-list'

const bookmarks = [
  {
    id: '018f0000-0000-7000-8000-000000000001',
    user_id: '018f0000-0000-7000-8000-0000000000aa',
    url: 'https://example.com/a',
    title: 'Alpha',
    created_at: '2026-07-20T10:00:00.000Z',
  },
  {
    id: '018f0000-0000-7000-8000-000000000002',
    user_id: '018f0000-0000-7000-8000-0000000000aa',
    url: 'https://example.com/b',
    title: 'Beta',
    created_at: '2026-07-21T10:00:00.000Z',
  },
]

describe('BookmarkList', () => {
  it('renders a skeleton while the query is pending', () => {
    server.use(
      http.get('*/api/v1/bookmarks', async () => {
        await delay('infinite')
        return HttpResponse.json({ items: [], has_more: false, next_cursor_id: null })
      })
    )
    render(<BookmarkList />, { wrapper: createWrapper() })
    expect(screen.getByRole('status', { name: /loading bookmarks/i })).toBeInTheDocument()
  })

  it('renders each bookmark as a list item with a link', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: bookmarks, has_more: false, next_cursor_id: null })
      )
    )
    render(<BookmarkList />, { wrapper: createWrapper() })
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'href',
      'https://example.com/b'
    )
  })

  it('renders an empty state when there are no bookmarks', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: [], has_more: false, next_cursor_id: null })
      )
    )
    render(<BookmarkList />, { wrapper: createWrapper() })
    expect(await screen.findByText(/no bookmarks yet/i)).toBeInTheDocument()
  })

  it('renders an error state when the request fails', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ error: { code: 'server_error', message: 'kaboom' } }, { status: 500 })
      )
    )
    render(<BookmarkList />, { wrapper: createWrapper() })
    expect(await screen.findByRole('alert')).toHaveTextContent('kaboom')
  })
})
