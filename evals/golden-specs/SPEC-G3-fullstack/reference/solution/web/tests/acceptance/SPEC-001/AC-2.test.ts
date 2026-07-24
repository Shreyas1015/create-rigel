/**
 * SPEC-G3 (web slice) AC-2 — the frontend response type is imported from the GENERATED
 * contract (`src/types/api.generated.ts`), not hand-defined.
 *
 * This is a static contract-boundary check: the hook must reference the generated
 * `BookmarkCountResponse` component from `@/types/api.generated`, that generated file must
 * actually carry the `/bookmarks/count` path + component (proving `/api-sync` ran against the
 * live endpoint), and the hook must NOT hand-roll its own count-response shape.
 *
 * Red before the hook exists (readFileSync throws) and before `/api-sync` (the generated file
 * lacks the count path/component). Green once both land.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const HOOK = 'src/hooks/use-bookmark-count.ts'
const GENERATED = 'src/types/api.generated.ts'

describe('AC-2: the count response type comes from the generated contract', () => {
  it('AC-2: the hook imports its response type from src/types/api.generated (not hand-defined)', () => {
    const hookSrc = readFileSync(HOOK, 'utf8')
    const genSrc = readFileSync(GENERATED, 'utf8')

    // The hook pulls its type from the generated contract module...
    expect(hookSrc).toMatch(/from\s+['"]@\/types\/api\.generated['"]/)
    // ...specifically the generated BookmarkCountResponse component.
    expect(hookSrc).toContain("components['schemas']['BookmarkCountResponse']")
    // ...which the /api-sync export actually produced against the live endpoint.
    expect(genSrc).toContain('/bookmarks/count')
    expect(genSrc).toContain('BookmarkCountResponse')
    // ...and the hook does NOT hand-roll its own count-response shape.
    // ([^}]* spans newlines already, so no `s` flag is needed — keeps the ES target portable.)
    expect(hookSrc).not.toMatch(/interface\s+\w+\s*\{[^}]*\bcount\b\s*:/)
  })
})
