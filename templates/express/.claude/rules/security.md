---
paths:
  - "src/runtime/**/*.ts"
  - "src/repo/**/*.ts"
---

# Security Rules — Auto-injected on runtime and repo file edits

## Runtime: Handler Security Checklist

Every protected handler MUST follow this exact order:

```typescript
// 1. Auth FIRST — before anything else
const auth = await requireAuth(req)  // throws UnauthorizedError if invalid

// 2. Rate limit
const limited = await checkRateLimit(req, 'USER_API')
if (limited) return res.status(429).json(limited)

// 3. Input validation — Zod, always
const body = CreateApplicationSchema.parse(req.body)
// Never: const body = req.body as CreateApplicationInput

// 4. Call service with typed domain inputs
const result = await applicationService.create(auth.userId, body)

// 5. Respond with envelope
return res.status(201).json(ok(result, req.requestId))
```

## Repo: Data Boundary Validation

```typescript
// ✅ REQUIRED — every query result
const raw = await Application.findByPk(id)
if (!raw) throw new NotFoundError(`Application ${id} not found`)
return ApplicationSchema.parse(raw.toJSON())

// ❌ FORBIDDEN — TypeScript lie
return raw as Application
return raw.toJSON() as Application
```

## SQL Injection Prevention

```typescript
// ✅ Safe — Sequelize parameterises automatically
await Application.findAll({ where: { userId, stage } })

// ✅ Safe — named replacements for raw queries
await sequelize.query(
  'SELECT * FROM applications WHERE user_id = :userId',
  { replacements: { userId }, type: QueryTypes.SELECT }
)

// ❌ BLOCKED by ESLint — string interpolation
await sequelize.query(`SELECT * FROM applications WHERE user_id = '${userId}'`)
```

## Auth Middleware — Never Inline

```typescript
// ✅ Always use the provider
import { requireAuth } from '../../providers/auth/middleware'

// ❌ Never roll your own inline JWT verification
const token = req.headers.authorization?.split(' ')[1]
const payload = jwt.verify(token, process.env.JWT_SECRET) // multiple violations
```

## Error Responses — Never Expose Internals

```typescript
// ✅ Correct — sanitised
return next(new NotFoundError('Application not found'))
// → errorHandler maps to: { error: { code: 'NOT_FOUND', message: 'Application not found' } }

// ❌ Wrong — exposes internals
res.status(500).json({ error: err.message, stack: err.stack })
```

## Ownership Enforcement in Repo

```typescript
// ✅ ALWAYS — user can only access their own resources
await Application.findOne({ where: { id, userId } })         // userId from auth context
await Application.findByPk(id, { where: { userId } })

// ❌ NEVER — no ownership check
await Application.findByPk(id)  // any user can access any application
```
