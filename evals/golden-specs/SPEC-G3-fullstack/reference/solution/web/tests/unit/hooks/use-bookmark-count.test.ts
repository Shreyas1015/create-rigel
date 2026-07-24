import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { useBookmarkCount, bookmarkCountKeys } from '@/hooks/use-bookmark-count'

describe('useBookmarkCount', () => {
  it('returns the caller-scoped count from the typed contract', async () => {
    server.use(
      http.get('*/bookmarks/count', () =>
        HttpResponse.json({
          ok: true,
          data: { count: 7 },
          meta: { requestId: 't', timestamp: '' },
        })
      )
    )
    const { result } = renderHook(() => useBookmarkCount(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ count: 7 })
  })

  it('surfaces an error when the endpoint fails', async () => {
    server.use(
      http.get('*/bookmarks/count', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'boom', message: 'nope' }, meta: {} },
          { status: 500 }
        )
      )
    )
    const { result } = renderHook(() => useBookmarkCount(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('exposes a stable query-key factory', () => {
    expect(bookmarkCountKeys.all).toEqual(['bookmarks', 'count'])
  })
})
