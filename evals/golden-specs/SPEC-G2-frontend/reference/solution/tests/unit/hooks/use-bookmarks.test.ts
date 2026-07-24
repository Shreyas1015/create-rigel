import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { useBookmarks, bookmarkKeys } from '@/hooks/use-bookmarks'

const bookmark = {
  id: '018f0000-0000-7000-8000-000000000001',
  user_id: '018f0000-0000-7000-8000-0000000000aa',
  url: 'https://example.com',
  title: 'Example',
  created_at: '2026-07-20T10:00:00.000Z',
}

describe('bookmarkKeys', () => {
  it('nests list keys under the bookmarks root', () => {
    expect(bookmarkKeys.list({ limit: 5 })).toEqual(['bookmarks', 'list', { limit: 5 }])
  })
})

describe('useBookmarks', () => {
  it('returns the bookmarks envelope on success', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: [bookmark], has_more: false, next_cursor_id: null })
      )
    )
    const { result } = renderHook(() => useBookmarks(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(1)
    expect(result.current.data?.items[0]?.title).toBe('Example')
  })

  it('surfaces a typed error when the request fails', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ error: { code: 'server_error', message: 'boom' } }, { status: 500 })
      )
    )
    const { result } = renderHook(() => useBookmarks({ limit: 10 }), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('boom')
  })
})
