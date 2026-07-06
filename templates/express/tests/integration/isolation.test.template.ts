/**
 * TEMPLATE — Cross-User Isolation Test (the most important security test).
 *
 * This file is named `*.template.ts` so Jest does NOT run it (the matcher is
 * `*.test.ts`). For every user-owned resource, COPY this to
 * `tests/integration/<resource>.isolation.test.ts` (where <resource> matches the
 * repo base name, e.g. `application.repo.ts` → `application.isolation.test.ts`),
 * replace the placeholders, and make it pass.
 *
 * This is ENFORCED, not optional: `tests/architecture/isolation.test.ts` fails CI
 * for any repo that scopes queries by userId but has no matching isolation test.
 *
 * The invariant (ARCHITECTURE.md, Repo layer):
 *   A resource owned by user A must be invisible to user B. When B requests A's
 *   resource, the API responds 404 — NEVER 403. A 403 confirms the resource
 *   exists; a 404 reveals nothing.
 *
 * Replace:
 *   - `/api/v1/applications`     → your resource route
 *   - `createApplication(...)`   → your create helper / factory
 *   - `validBody`                → a valid create payload
 *   - `authTokenFor(userId)`     → your test auth-token helper
 */
import request from 'supertest'
import { app } from '../../src/runtime/app.js'
// import { authTokenFor, createUser, resetDb } from './setup.js'

describe('cross-user isolation: applications', () => {
  let userA: string
  let userB: string
  let tokenA: string
  let tokenB: string
  let resourceId: string

  beforeAll(async () => {
    // await resetDb()
    // userA = (await createUser('a@example.com')).id
    // userB = (await createUser('b@example.com')).id
    // tokenA = authTokenFor(userA)
    // tokenB = authTokenFor(userB)

    // User A creates a resource
    const created = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(/* validBody */ {})
    resourceId = created.body.data.id
  })

  it("user B cannot READ user A's resource (404, not 403)", async () => {
    const res = await request(app)
      .get(`/api/v1/applications/${resourceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
  })

  it("user B cannot UPDATE user A's resource (404)", async () => {
    const res = await request(app)
      .patch(`/api/v1/applications/${resourceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ note: 'hijack attempt' })
    expect(res.status).toBe(404)
  })

  it("user B cannot DELETE user A's resource (404)", async () => {
    const res = await request(app)
      .delete(`/api/v1/applications/${resourceId}`)
      .set('Authorization', `Bearer ${tokenB}`)
    expect(res.status).toBe(404)
  })

  it("user A's resource never appears in user B's list", async () => {
    const res = await request(app)
      .get('/api/v1/applications')
      .set('Authorization', `Bearer ${tokenB}`)
    const ids = (res.body.data.items as Array<{ id: string }>).map((r) => r.id)
    expect(ids).not.toContain(resourceId)
  })

  it('user A (the owner) can still read their own resource (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/applications/${resourceId}`)
      .set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(resourceId)
  })
})
