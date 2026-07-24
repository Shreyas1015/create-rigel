import type { RequestHandler } from 'msw'

// MSW request handlers. Empty is a valid starting point — tests/setup.ts warns on any
// unhandled request rather than failing. Add per-endpoint handlers as features land, or
// override per-test with `server.use(...)`.
export const handlers: RequestHandler[] = []
