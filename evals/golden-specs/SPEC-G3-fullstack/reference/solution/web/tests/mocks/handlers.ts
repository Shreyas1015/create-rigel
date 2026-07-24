import { http, HttpResponse } from 'msw'
import type { RequestHandler } from 'msw'

// Default MSW handlers. The count endpoint defaults to 0 so a bare render is deterministic;
// tests override per-case with `server.use(...)`.
export const handlers: RequestHandler[] = [
  http.get('*/bookmarks/count', () =>
    HttpResponse.json({
      ok: true,
      data: { count: 0 },
      meta: { requestId: 'msw', timestamp: new Date().toISOString() },
    })
  ),
]
