---
paths:
  - "src/**/*.ts"
---

# Architecture Rules — Auto-injected on every src/ file edit

## Import Order Enforcement

Before writing any import, check which layer you are in:

| Your file is in | You may import from |
|---|---|
| `src/types/` | Nothing |
| `src/config/` | `src/types/` only |
| `src/models/` | `src/types/`, `src/config/` |
| `src/repo/` | `src/types/`, `src/config/`, `src/models/` |
| `src/services/` | `src/types/`, `src/config/`, `src/repo/` |
| `src/runtime/` | `src/types/`, `src/config/`, `src/repo/`, `src/services/` |
| `src/utils/` | Nothing (zero domain imports) |
| `src/providers/` | `src/types/`, `src/config/` only |

**Any import that violates this table is a layer violation. Fix it before proceeding.**

## The Checks You Must Pass

### Types layer (`src/types/`)
```typescript
// ✅ Correct — pure interface, no imports
export interface Application { id: string; stage: ApplicationStage }

// ❌ Wrong — importing another layer
import { env } from '../config/env'   // FORBIDDEN in types
```

### Config layer (`src/config/`)
```typescript
// ✅ Correct
import { z } from 'zod'                    // third-party ok
import type { Application } from '../types' // Types ok

// ❌ Wrong
import { userRepo } from '../repo/user.repo'  // FORBIDDEN
```

### Service layer (`src/services/`)
```typescript
// ✅ Correct — takes domain types, returns domain types
export async function createApplication(userId: string, input: CreateApplicationInput): Promise<Application>

// ❌ Wrong — HTTP types in service
import { Request, Response } from 'express'   // FORBIDDEN
import { HttpException } from '../runtime/...' // FORBIDDEN
```

### Runtime layer (`src/runtime/`)
```typescript
// ✅ Correct handler structure (THIS ORDER — every time)
router.post('/applications', async (req, res, next) => {
  try {
    const auth = await requireAuth(req)                          // 1. Auth
    const limited = await rateLimitMiddleware(req, 'USER_API')  // 2. Rate limit
    if (limited) return res.status(429).json(limited)
    const body = CreateApplicationSchema.parse(req.body)         // 3. Validate
    const result = await applicationService.create(auth.userId, body) // 4. Service
    return res.status(201).json(ok(result, req.requestId))       // 5. Respond
  } catch (err) { next(err) }                                    // 6. Error handler
})

// ❌ Wrong — business logic in handler
router.post('/applications', async (req, res) => {
  if (req.body.stage === 'APPLIED') { ... }  // logic belongs in service
})
```

## Structural Test
`tests/architecture/layers.test.ts` imports madge and fails CI if any of these are violated.
Run it: `npm run test:arch`
