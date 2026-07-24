import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// Node (vitest) MSW server used by tests/setup.ts. Feature tests register or override
// handlers with `server.use(...)`.
export const server = setupServer(...handlers)
