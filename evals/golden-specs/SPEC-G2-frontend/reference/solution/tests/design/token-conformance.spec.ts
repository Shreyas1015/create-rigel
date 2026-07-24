import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { COLLECT_PROPS, checkStyles, tokensFromDtcg, tokensAreEmpty } from './token-conformance.mjs'

// AC-6 — deterministic design-token conformance. For each route, read the computed
// styles of every visible element and fail on any color/spacing/radius/font value not
// in tokens.json (the single source of truth — PLAN-005 AC-6). Skips cleanly until
// tokens.json defines semantic tokens.

function safeRead(path: string, fallback: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return fallback
  }
}

const tokens = tokensFromDtcg(safeRead('tokens.json', '{}'))
let routes: string[]
try {
  routes = JSON.parse(safeRead('tests/design/routes.json', '["/"]')) as string[]
} catch {
  routes = ['/']
}

test.describe('AC-6 — design-token conformance', () => {
  test.skip(
    tokensAreEmpty(tokens),
    'No semantic tokens in tokens.json yet — add them (and run tokens:build) to enable the check.'
  )

  for (const route of routes) {
    test(`route ${route} uses only tokens.json tokens`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' })
      const collected = await page.evaluate((props: string[]) => {
        const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
        const out: Array<{ sel: string; styles: Record<string, string> }> = []
        const els = Array.from(document.querySelectorAll('body *')).slice(0, 800)
        for (const el of els) {
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
          const styles: Record<string, string> = {}
          for (const p of props) styles[p] = cs.getPropertyValue(kebab(p))
          const cls =
            typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/)[0]
              : ''
          const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls
          out.push({ sel, styles })
        }
        return out
      }, COLLECT_PROPS)

      const violations = checkStyles(
        collected.map((c) => ({ route, sel: c.sel, styles: c.styles })),
        tokens
      )
      expect(
        violations,
        `Non-token values on ${route} (add them to tokens.json or fix the styles):\n${violations.join('\n')}`
      ).toEqual([])
    })
  }
})
