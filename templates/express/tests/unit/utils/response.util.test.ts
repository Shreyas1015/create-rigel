/**
 * EXAMPLE unit test — the model for utils-layer tests (100% coverage required).
 *
 * Activates once /infra-setup generates `src/utils/response.util.ts`. It pins
 * the canonical response envelope (see .claude/rules/api.md):
 *   ok(data, requestId)        → { ok: true,  data, meta: { requestId, timestamp } }
 *   err(code, message, reqId)  → { ok: false, error: { code, message }, meta: { requestId } }
 *
 * Utils tests must cover every branch and edge case — no exceptions.
 */
import { ok, err } from '../../../src/utils/response.util.js'

describe('response.util — ok()', () => {
  it('wraps data with ok: true and the request id', () => {
    const res = ok({ id: 'abc' }, 'req-123')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual({ id: 'abc' })
    expect(res.meta.requestId).toBe('req-123')
  })

  it('includes an ISO timestamp in meta', () => {
    const res = ok({ id: 'abc' }, 'req-123')
    expect(typeof res.meta.timestamp).toBe('string')
    expect(() => new Date(res.meta.timestamp).toISOString()).not.toThrow()
  })

  it('preserves array payloads without mutation', () => {
    const items = [1, 2, 3]
    const res = ok(items, 'req-123')
    expect(res.data).toBe(items)
  })

  it('handles null data', () => {
    const res = ok(null, 'req-123')
    expect(res.ok).toBe(true)
    expect(res.data).toBeNull()
  })
})

describe('response.util — err()', () => {
  it('wraps an error with ok: false and the canonical shape', () => {
    const res = err('NOT_FOUND', 'Application not found', 'req-456')
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('NOT_FOUND')
    expect(res.error.message).toBe('Application not found')
    expect(res.meta.requestId).toBe('req-456')
  })

  it('never leaks a data field on errors', () => {
    const res = err('INTERNAL_ERROR', 'boom', 'req-456')
    expect(res).not.toHaveProperty('data')
  })
})
