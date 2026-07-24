/**
 * SPEC-G3 (web slice) AC-3 — BookmarkCountBadge renders the count via the hook (no direct
 * fetch), and renders `0` (not empty) for a user with no bookmarks.
 *
 * The badge is rendered through a real QueryClient wrapper with MSW mocking the count endpoint;
 * the empty-user case (count 0) must show "0", not a blank badge. Red before the feature exists
 * (module import fails). Green once the badge + hook land.
 */
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
        meta: { requestId: 'test', timestamp: new Date().toISOString() },
      })
    )
  )
}

describe('AC-3: BookmarkCountBadge renders the count via the hook', () => {
  it('AC-3: renders 0 (not blank) for a user with no bookmarks', async () => {
    mockCount(0)
    render(<BookmarkCountBadge />, { wrapper: createWrapper() })
    // The empty-user count renders as "0" — not a blank badge.
    expect(await screen.findByText('0')).toBeInTheDocument()
  })

  it('AC-3: renders the count value returned by the hook (e.g. 5)', async () => {
    mockCount(5)
    render(<BookmarkCountBadge />, { wrapper: createWrapper() })
    expect(await screen.findByText('5')).toBeInTheDocument()
  })
})
