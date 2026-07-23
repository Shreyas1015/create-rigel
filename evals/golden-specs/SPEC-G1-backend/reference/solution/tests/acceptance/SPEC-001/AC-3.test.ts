/**
 * SPEC-G1 AC-3 — cross-user isolation. User B requesting (via list) or deleting user A's
 * bookmark id gets 404 — NEVER 403 (we never reveal that the resource exists).
 *
 * Red before the feature exists (A's create → 404, so there is nothing to isolate); green
 * once the repo scopes every owned read/delete by `userId`.
 */
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'
import { signAccessToken } from '../../../src/providers/auth/jwt.js'
import { newId } from '../../../src/utils/uuid.util.js'

describe('AC-3: cross-user isolation (404, never 403)', () => {
  it("AC-3: user B deleting user A's bookmark returns 404 (not 403), and A's bookmark never appears in B's list", async () => {
    const tokenA = await signAccessToken(newId(), ['user'])
    const tokenB = await signAccessToken(newId(), ['user'])

    // A creates a bookmark it owns.
    const created = await request(app)
      .post('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ url: 'https://example.com/owned-by-a', title: "A's private bookmark" })
    expect(created.status).toBe(201)
    const resourceId = created.body.data.id as string

    // B cannot delete A's bookmark — 404, and specifically NOT 403.
    const del = await request(app)
      .delete(`/api/v1/bookmarks/${resourceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(del.status).toBe(404)
    expect(del.status).not.toBe(403)
    expect(del.body.error.code).toBe('NOT_FOUND')

    // A's bookmark never appears in B's list.
    const bList = await request(app)
      .get('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenB}`)
    expect(bList.status).toBe(200)
    const bIds = (bList.body.data as Array<{ id: string }>).map((r) => r.id)
    expect(bIds).not.toContain(resourceId)

    // The owner (A) can still see and delete their own bookmark.
    const aList = await request(app)
      .get('/api/v1/bookmarks')
      .set('Authorization', `Bearer ${tokenA}`)
    const aIds = (aList.body.data as Array<{ id: string }>).map((r) => r.id)
    expect(aIds).toContain(resourceId)
  })
})
