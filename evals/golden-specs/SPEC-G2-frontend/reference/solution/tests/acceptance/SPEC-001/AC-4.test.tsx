// SPEC-001 (golden SPEC-G2) — AC-4 acceptance test (holdout).
// AC-4: the rendered /bookmarks page passes design-token conformance — no off-token
// color/spacing/radius/type values. In this Tailwind-v4 + @theme-token system, an off-token
// value can only enter the rendered DOM via a Tailwind ARBITRARY-VALUE utility (e.g.
// `bg-[#fff]`, `p-[13px]`, `rounded-[7px]`, `text-[15px]`) or a raw inline `style`. This test
// renders the populated page tree and fails on either. It complements the two static checks
// the gate already runs: eslint-plugin-tailwindcss `no-arbitrary-value` and the Playwright
// computed-style conformance in tests/design. Fails RED pre-implementation (import unresolved).
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
]

/** Every whitespace-split class token across a rendered subtree. */
function classTokens(root: HTMLElement): string[] {
  const tokens: string[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const cls = el.getAttribute('class') ?? ''
    for (const t of cls.split(/\s+/)) if (t) tokens.push(t)
  }
  return tokens
}

describe('AC-4: /bookmarks renders with design tokens only (no off-token values)', () => {
  it('AC-4: the rendered page uses no arbitrary-value classes and no inline styles', async () => {
    server.use(
      http.get('*/api/v1/bookmarks', () =>
        HttpResponse.json({ items: bookmarks, has_more: false, next_cursor_id: null })
      )
    )

    const { container } = render(<BookmarkList />, { wrapper: createWrapper() })
    await screen.findByText('Next.js Docs') // ensure the populated tree is rendered

    const root = container.firstElementChild as HTMLElement
    const tokens = classTokens(root)

    // 1. No Tailwind arbitrary value / arbitrary property — the only vector for an
    //    off-token color/spacing/radius/type value. (`x-[…]` or `[prop:value]`.)
    const arbitrary = tokens.filter((t) => t.includes('[') || t.includes(']'))
    expect(arbitrary).toEqual([])

    // 2. No raw inline styles that could smuggle an off-token color/length past the classes.
    const inlineStyled = Array.from(root.querySelectorAll('[style]')).map(
      (el) => el.getAttribute('style') ?? ''
    )
    expect(inlineStyled).toEqual([])

    // 3. Positive: the tree IS styled through design tokens (semantic @theme utilities),
    //    not unstyled — so "token conformance" isn't vacuously true on an unstyled page.
    const tokenUtilities = tokens.filter(
      (t) => /^(bg|text|border|rounded|ring)-[a-z]/.test(t) && !t.includes('[')
    )
    expect(tokenUtilities.length).toBeGreaterThan(0)
  })
})
