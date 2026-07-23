/**
 * Cross-User Isolation Test — bookmarks (the most important security test).
 *
 * Enforced by tests/architecture/isolation.test.ts: the gate fails if this file is missing
 * while bookmark.repo.ts scopes by userId.
 *
 * Invariant (ARCHITECTURE.md, Repo layer): a bookmark owned by user A must be invisible to
 * user B. When B deletes or lists A's bookmark, the API responds 404 / omits it — NEVER 403.
 *
 * Runs against the migrated schema (jest globalSetup). SPEC-G1 has no users table, so tokens
 * are signed directly (two distinct random user ids). Seeds once in beforeAll; does not truncate.
 */
import request from 'supertest'
import { app } from '../../src/runtime/app.js'
import { signAccessToken } from '../../src/providers/auth/jwt.js'
import { newId } from '../../src/utils/uuid.util.js'

describe('cross-user isolation: bookmarks', () => {
  let tokenA: string
  let tokenB: string
  let resourceId: string

  beforeAll(async () => {
    tokenA = await signAccessToken(newId(), ['user'])
    tokenB = await signAccessToken(newId(), ['user'])

    const created = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: 'https://example.com/owned-by-a', title: "A's private bookmark" })
    resourceId = created.body.data.id as string
  })

  it("user B cannot DELETE user A's bookmark (404, not 403)", async () => {
    const res = await request(app)
      .delete(`/api/v1/bookmarks/${resourceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it("user A's bookmark never appears in user B's list", async () => {
    const res = await request(app)
      .get('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id)
    expect(ids).not.toContain(resourceId)
  })

  it('user A (the owner) can still list their own bookmark (200)', async () => {
    const res = await request(app)
      .get('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id)
    expect(ids).toContain(resourceId)
  })
})
