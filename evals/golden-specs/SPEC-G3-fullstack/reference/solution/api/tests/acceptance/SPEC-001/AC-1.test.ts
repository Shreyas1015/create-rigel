/**
 * SPEC-G3 (api slice) AC-1 — GET /api/v1/bookmarks/count with auth returns 200 and
 * `data.count` equals the caller's bookmark count.
 *
 * Proves what the badge depends on:
 *   - a brand-new user's count is 0 (not null/blank), and the endpoint requires auth,
 *   - after creating N bookmarks the count is N, and another user's bookmarks are NOT counted.
 *
 * Red before the /count route exists: GET /bookmarks/count is swallowed by GET /:id
 * (id="count" → 404 NotFound), so `data.count` is undefined. Green once the aggregate lands.
 * (Every AC-1 test asserts a count value, so none passes trivially pre-implementation.)
 */
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'
import { signAccessToken } from '../../../src/providers/auth/jwt.js'
import { newId } from '../../../src/utils/uuid.util.js'

/** A signed access token for a fresh random user id (no user row needed — requireAuth verifies JWT). */
async function tokenForNewUser(): Promise<string> {
  return signAccessToken(newId(), ['user'])
}

async function createBookmark(token: string, url: string): Promise<void> {
  const res = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({ url, title: 'A read' })
  expect(res.status).toBe(201)
}

describe('AC-1: GET /api/v1/bookmarks/count returns the caller-scoped count', () => {
  it('AC-1: requires auth, and a new user with no bookmarks gets 200 with data.count === 0', async () => {
    // Requires auth (401 without a token) — the endpoint is owner-scoped.
    const unauth = await request(app).get('/api/v1/bookmarks/count')
    expect(unauth.status).toBe(401)

    // A brand-new authenticated user's count is 0 (not null / blank).
    const token = await tokenForNewUser()
    const res = await request(app)
      .get('/api/v1/bookmarks/count')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.count).toBe(0)
    expect(res.body.meta).toHaveProperty('requestId')
  })

  it('AC-1: after creating N bookmarks, data.count === N and other users are not counted', async () => {
    const token = await tokenForNewUser()
    const otherToken = await tokenForNewUser()

    // The other user creates one bookmark that must NOT be counted for our caller.
    await createBookmark(otherToken, 'https://example.com/not-mine')

    await createBookmark(token, 'https://example.com/a')
    await createBookmark(token, 'https://example.com/b')
    await createBookmark(token, 'https://example.com/c')

    const res = await request(app)
      .get('/api/v1/bookmarks/count')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(3)
  })
})
