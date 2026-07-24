import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'
import { createWrapper } from '../../utils/create-wrapper'
import { BookmarkCountBadge } from '@/features/bookmarks/bookmark-count-badge'

afterEach(cleanup)

function mockCount(count: number): void {
  server.use(
    http.get('*/bookmarks/count', () =>
      HttpResponse.json({
        ok: true,
        data: { count },
        meta: { requestId: 't', timestamp: '' },
      })
    )
  )
}

describe('BookmarkCountBadge', () => {
  it('renders 0 (not blank) for an empty user', async () => {
    mockCount(0)
    render(<BookmarkCountBadge />, { wrapper: createWrapper() })
    expect(await screen.findByText('0')).toBeInTheDocument()
  })

  it('renders the count value from the hook', async () => {
    mockCount(9)
    render(<BookmarkCountBadge />, { wrapper: createWrapper() })
    expect(await screen.findByText('9')).toBeInTheDocument()
  })

  it('renders an error placeholder when the count cannot be loaded', async () => {
    server.use(
      http.get('*/bookmarks/count', () =>
        HttpResponse.json(
          { ok: false, error: { code: 'x', message: 'y' }, meta: {} },
          { status: 500 }
        )
      )
    )
    render(<BookmarkCountBadge />, { wrapper: createWrapper() })
    expect(await screen.findByText('—')).toBeInTheDocument()
  })
})
