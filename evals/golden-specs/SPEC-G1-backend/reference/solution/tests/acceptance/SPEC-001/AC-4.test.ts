/**
 * SPEC-G1 AC-4 — GET /api/v1/bookmarks is cursor-paginated: it returns a cursor in
 * `meta.nextCursor`, the cursor advances to the next page, and the repo uses keyset
 * pagination on (createdAt, id) — never offset.
 *
 * Red before the feature exists (create → 404, no cursor); green once the list endpoint
 * returns a keyset cursor.
 */
import { existsSync, readFileSync } from 'node:fs'
import request from 'supertest'
import { app } from '../../../src/runtime/app.js'
import { signAccessToken } from '../../../src/providers/auth/jwt.js'
import { newId } from '../../../src/utils/uuid.util.js'

describe('AC-4: cursor pagination (meta.nextCursor, no offset)', () => {
  it('AC-4: GET /api/v1/bookmarks returns a meta.nextCursor that advances to the next page', async () => {
    const token = await signAccessToken(newId(), ['user'])

    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const r = await request(app)
        .post('/api/v1/bookmarks')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: `https://example.com/i${i}`, title: `item ${i}` })
      expect(r.status).toBe(201)
      ids.push(r.body.data.id as string)
    }

    // Page 1: newest-first, limit 2, with a cursor for page 2.
    const p1 = await request(app)
      .get('/api/v1/bookmarks?limit=2')
      .set('Authorization', `Bearer ${token}`)
    expect(p1.status).toBe(200)
    expect((p1.body.data as Array<{ id: string }>).map((r) => r.id)).toEqual([ids[2], ids[1]])
    expect(typeof p1.body.meta.nextCursor).toBe('string')
    expect((p1.body.meta.nextCursor as string).length).toBeGreaterThan(0)

    // Page 2: the cursor continues from where page 1 ended (keyset, not offset).
    const p2 = await request(app)
      .get(
        `/api/v1/bookmarks?limit=2&cursor=${encodeURIComponent(p1.body.meta.nextCursor as string)}`
      )
      .set('Authorization', `Bearer ${token}`)
    expect(p2.status).toBe(200)
    expect((p2.body.data as Array<{ id: string }>).map((r) => r.id)).toEqual([ids[0]])
    expect(p2.body.meta.nextCursor).toBeNull()
  })

  it('AC-4: the bookmark repo uses keyset pagination on (createdAt, id) — never offset', () => {
    const repoPath = 'src/repo/bookmark.repo.ts'
    expect(existsSync(repoPath)).toBe(true)
    const src = readFileSync(repoPath, 'utf8')
    // No Sequelize `offset:` option anywhere — pagination is keyset (compares createdAt/id
    // with Op.lt), never a numeric offset. (Matches the option, not the word in prose.)
    expect(/offset\s*:/i.test(src)).toBe(false)
    expect(src.includes('Op.lt')).toBe(true)
  })
})
