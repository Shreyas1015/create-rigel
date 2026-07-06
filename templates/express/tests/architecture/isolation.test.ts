/**
 * Cross-user isolation contract — mechanical enforcement of the invariant in
 * ARCHITECTURE.md (Repo layer): a resource owned by user A must be invisible to
 * user B (the API responds 404, never 403).
 *
 * For every repo that enforces ownership (a userId-scoped query), an isolation
 * integration test MUST exist at `tests/integration/<resource>.isolation.test.ts`.
 * This replaces the old "copy isolation.test.template.ts by hand" honor system:
 * the suite fails CI if an owned resource ships without its isolation test.
 *
 * Fresh repos (no src/repo yet) pass; the check tightens as repos appear.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_DIR = 'src/repo'
const INTEGRATION_DIR = 'tests/integration'

// A repo enforces ownership if it scopes queries by the owning user — the harness
// pattern is `findByIdAndUser` / `where: { ..., userId }`.
const OWNERSHIP_RE = /findByIdAndUser|userId|user_id/

/** Resource base names (e.g. "application") for repos that enforce ownership. */
function ownedResources(): string[] {
  if (!existsSync(REPO_DIR)) return []
  const out: string[] = []
  for (const file of readdirSync(REPO_DIR)) {
    if (!file.endsWith('.repo.ts')) continue
    const src = readFileSync(join(REPO_DIR, file), 'utf8')
    if (OWNERSHIP_RE.test(src)) out.push(file.replace(/\.repo\.ts$/, ''))
  }
  return out
}

describe('architecture: cross-user isolation contract', () => {
  const resources = ownedResources()

  if (resources.length === 0) {
    it('no owned resources yet — isolation contract not applicable', () => {
      expect(resources).toEqual([])
    })
  } else {
    it.each(resources)(
      'owned resource "%s" must ship its tests/integration/<resource>.isolation.test.ts',
      (resource) => {
        const expected = join(INTEGRATION_DIR, `${resource}.isolation.test.ts`)
        expect(existsSync(expected)).toBe(true)
      }
    )
  }
})
