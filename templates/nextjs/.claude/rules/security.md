---
paths:
  - "src/lib/api-client.ts"
  - "app/api/**/*.ts"
  - "src/features/auth/**/*.ts"
  - "src/features/auth/**/*.tsx"
---

# Security Rules — Auto-injected on auth and API client edits

## Auth Token Handling

```typescript
// ✅ Access token in React context (memory only)
// src/features/auth/AuthProvider.tsx
const [accessToken, setAccessToken] = useState<string | null>(null)
// Store ONLY in React state — wiped on page refresh by design

// ✅ Inject access token via api-client middleware
// src/lib/api-client.ts
import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api.generated'

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = getAccessTokenFromContext()  // from React context
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
}

export const apiClient = createClient<paths>({ baseUrl: env.NEXT_PUBLIC_API_URL })
apiClient.use(authMiddleware)

// ❌ NEVER — token in storage
localStorage.setItem('accessToken', token)
sessionStorage.setItem('accessToken', token)
document.cookie = `accessToken=${token}`  // use httpOnly cookies via backend
```

## Refresh Token Flow

```typescript
// src/app/api/auth/refresh/route.ts — Next.js API route
// The refresh token is in an httpOnly cookie (set by backend)
// This route proxies the refresh request so the cookie is sent automatically

export async function POST() {
  const response = await fetch(`${env.API_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',  // sends the httpOnly cookie
  })
  const data = await response.json()
  // Return new access token to client — it goes into React context
  return NextResponse.json({ accessToken: data.accessToken })
}
```

## Environment Variables Security

```typescript
// ✅ Only NEXT_PUBLIC_* vars are safe to expose to client
// Non-NEXT_PUBLIC_ vars are server-only — NEVER access in client components

// src/lib/env.ts — validate all public env vars with Zod
import { z } from 'zod'
const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
})
// Never put secrets (JWT_SECRET, DB passwords) in NEXT_PUBLIC_* vars

// ❌ Leaked secret
NEXT_PUBLIC_JWT_SECRET=my-secret  // accessible to all users in browser
```

## Content Security Policy

```typescript
// next.config.ts — CSP via headers
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL};
  frame-ancestors 'none';
`.replace(/\n/g, ' ')
```

## XSS Prevention

```typescript
// ✅ React escapes by default — just use JSX
<p>{userContent}</p>

// ❌ Only with explicit sanitisation
<div dangerouslySetInnerHTML={{ __html: userContent }} />
// If required: use DOMPurify.sanitize(userContent) first
```

## Next.js API Routes (Cookie Proxy Only)

```typescript
// app/api/ routes ONLY handle:
// 1. Cookie operations (set/clear httpOnly cookies)
// 2. Proxying auth requests
// NOT for business logic — that belongs in the backend

// ✅ Legitimate Next.js API route
export async function POST(request: Request) {
  const body = await request.json()
  const response = await fetch(`${env.API_URL}/api/v1/auth/login`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
  // Set httpOnly cookie with refresh token from backend response
  const res = NextResponse.json(await response.json())
  return res
}
```
