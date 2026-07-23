/**
 * SPEC-G1 AC-2 — any bookmarks endpoint called WITHOUT an auth token returns 401.
 *
 * Red before the bookmarks route exists (no route → 404); green once requireAuth is mounted
 * at the router level and rejects the missing token with 401.
 */
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'

describe('AC-2: authentication is required', () => {
  it('AC-2: POST /api/v1/bookmarks without a token returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/bookmarks')
      .send({ url: 'https://example.com/x', title: 'x' })
    expect(res.status).toBe(401)
    expect(res.body.ok).toBe(false)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('AC-2: GET /api/v1/bookmarks without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/bookmarks')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('AC-2: DELETE /api/v1/bookmarks/:id without a token returns 401', async () => {
    const res = await request(app).delete('/api/v1/bookmarks/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })
})
