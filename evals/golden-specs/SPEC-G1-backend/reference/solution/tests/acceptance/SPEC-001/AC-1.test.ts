/**
 * SPEC-G1 AC-1 — POST /api/v1/bookmarks with a valid body + auth returns 201, and the
 * response `data` carries an `id` and the submitted `url`.
 *
 * Red before the bookmarks route exists (POST → 404); green once the feature lands.
 */
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'
import { signAccessToken } from '../../../src/providers/auth/jwt.js'
import { newId } from '../../../src/utils/uuid.util.js'

async function tokenForNewUser(): Promise<string> {
  return signAccessToken(newId(), ['user'])
}

describe('AC-1: create a bookmark', () => {
  it('AC-1: POST /api/v1/bookmarks with a valid body and auth returns 201 with data.id and the submitted url', async () => {
    const token = await tokenForNewUser()
    const url = 'https://example.com/read-later'
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${token}`)
      .send({ url, title: 'Read me later' })

    expect(res.status).toBe(201)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.data.id).toBe('string')
    expect(res.body.data.id.length).toBeGreaterThan(0)
    expect(res.body.data.url).toBe(url)
    expect(res.body.meta).toHaveProperty('requestId')
  })
})
