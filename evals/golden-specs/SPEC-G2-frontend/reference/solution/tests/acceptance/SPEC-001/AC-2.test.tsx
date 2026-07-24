// SPEC-001 (golden SPEC-G2) — AC-2 acceptance test (holdout).
// AC-2: no component/feature/page calls fetch() directly — all data flows through
// src/hooks/. Deterministic source scan of the render layers. A SINGLE assertion block so
// the whole AC is RED pre-implementation: the feature that must route data through the hook
// does not exist yet. (Two blocks would let the vacuous "no fetch anywhere" half pass early,
// and the harness marks an AC passed if any of its titled tests pass.)
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FEATURE = 'src/features/bookmarks/bookmark-list.tsx'
// Layers where a direct fetch() is forbidden (data must come from a src/hooks/ hook).
const RENDER_DIRS = ['src/features', 'src/components', 'app', 'src/app']

function tsxFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      // shadcn primitives (src/components/ui) are vendored, not app render code.
      if (full.endsWith('components/ui')) return []
      return tsxFiles(full)
    }
    return /\.(ts|tsx)$/.test(full) ? [full] : []
  })
}

// A bare fetch( call — not someone's .refetch()/prefetchQuery() (preceded by a letter/dot).
const BARE_FETCH = /(^|[^A-Za-z.])fetch\s*\(/

describe('AC-2: data flows through src/hooks/ — no direct fetch() in render layers', () => {
  it('AC-2: the feature routes data through the hook and no render layer calls fetch() directly', () => {
    // (a) The bookmark-list feature exists and gets its data from the hooks layer.
    expect(existsSync(FEATURE)).toBe(true)
    const src = readFileSync(FEATURE, 'utf8')
    expect(src).toMatch(/from ['"]@\/hooks\/use-bookmarks['"]/)
    expect(src).toMatch(/useBookmarks\s*\(/)

    // (b) No feature/component/page issues a direct fetch() — all HTTP is in src/hooks/.
    const offenders = RENDER_DIRS.flatMap((dir) =>
      tsxFiles(dir).filter((f) => BARE_FETCH.test(readFileSync(f, 'utf8')))
    )
    expect(offenders).toEqual([])
  })
})
