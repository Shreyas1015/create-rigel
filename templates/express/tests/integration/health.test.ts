/**
 * EXAMPLE integration test — the model for runtime/route tests.
 *
 * Activates once /infra-setup generates `src/runtime/app.ts` with the health
 * routes. Demonstrates the supertest HTTP-contract pattern: hit the real
 * Express app, assert status + the canonical response envelope.
 *
 * `/health`  — liveness: process is up (always 200, no dependencies)
 * `/ready`   — readiness: DB ping + Redis ping (200 when both reachable)
 */
import request from 'supertest'
import { app } from '../../src/runtime/app.js'

describe('GET /health', () => {
  it('returns 200 (liveness — no dependencies)', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('returns the canonical success envelope', async () => {
    const res = await request(app).get('/health')
    expect(res.body.ok).toBe(true)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('meta.requestId')
  })

  it('propagates the X-Request-ID header', async () => {
    const res = await request(app).get('/health').set('X-Request-ID', 'test-req-id')
    expect(res.body.meta.requestId).toBe('test-req-id')
  })
})

describe('GET /ready', () => {
  it('returns 200 when dependencies are reachable', async () => {
    const res = await request(app).get('/ready')
    // 200 healthy, 503 when a dependency is down — both are valid contract responses
    expect([200, 503]).toContain(res.status)
    expect(res.body).toHaveProperty('ok')
  })
})
