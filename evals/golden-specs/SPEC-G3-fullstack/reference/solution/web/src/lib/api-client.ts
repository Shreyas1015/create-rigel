// src/lib/api-client.ts
// The typed openapi-fetch client — the single source of API calls, consumed only by hooks.
// `paths` is generated from the backend OpenAPI contract (`/api-sync` → api.generated.ts), so
// the wire shapes are the contract's, never hand-written.
import createClient from 'openapi-fetch'
import type { paths } from '@/types/api.generated'
import { env } from './env'

export const apiClient = createClient<paths>({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  // Lazy fetch: openapi-fetch binds globalThis.fetch at creation time (before MSW patches it in
  // beforeAll), so wrap it — otherwise hook tests capture the un-patched fetch and hit the network.
  fetch: (...args) => globalThis.fetch(...args),
})
