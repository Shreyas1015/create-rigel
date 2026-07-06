---
paths:
  - "tests/**/*.ts"
  - "tests/**/*.test.ts"
---

# Testing Rules — Auto-injected on test file edits

## Coverage Thresholds (enforced in CI — fail if below)

| Layer | Threshold | What to test |
|---|---|---|
| `src/utils/` | **100%** | Every branch, every edge case |
| `src/services/` | **90%** | Happy path + all error paths + state machine transitions |
| `src/repo/` | **80%** | Query results, Zod parse, ownership, cursor pagination |
| `src/runtime/routes/` | **75%** | Auth required, 422 validation, 404 not found |
| `src/providers/` | **70%** | Core functionality |

## Required Test Patterns

### Service Tests — error paths are mandatory
```typescript
describe('applicationService.transitionStage', () => {
  it('advances stage when transition is valid', async () => { ... })
  it('throws StageTransitionError when transition is invalid', async () => {
    await expect(applicationService.transitionStage(userId, appId, 'ACCEPTED'))
      .rejects.toThrow(StageTransitionError)
  })
  it('throws TerminalStageError when application is already accepted', async () => { ... })
  it('throws NotFoundError when application does not belong to user', async () => { ... })
  it('creates system note in same transaction as stage update', async () => { ... })
})
```

### Zod Schema Tests — malformed inputs
```typescript
describe('CreateApplicationSchema', () => {
  it('rejects missing company', () => {
    expect(() => CreateApplicationSchema.parse({ role: 'Engineer' })).toThrow()
  })
  it('rejects invalid stage value', () => {
    expect(() => ApplicationSchema.parse({ ...valid, stage: 'PENDING' })).toThrow()
  })
})
```

### Route Tests — test the HTTP contract
```typescript
describe('POST /api/v1/applications', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/applications').send(validBody)
    expect(res.status).toBe(401)
  })
  it('returns 422 with invalid body', async () => {
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'Engineer' })  // missing company
    expect(res.status).toBe(422)
  })
  it('returns 201 with standard envelope', async () => {
    const res = await request(app)
      .post('/api/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send(validBody)
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('data')
    expect(res.body).toHaveProperty('meta.requestId')
  })
})
```

### Architecture Tests — structural
```typescript
// tests/architecture/layers.test.ts
// Uses madge to check import graph
it('repo layer does not import from service or runtime', async () => {
  const graph = await madge('src/repo/', { tsConfig: 'tsconfig.json' })
  const deps = graph.obj()
  const violations = Object.entries(deps)
    .filter(([, imports]) => imports.some(i => i.includes('service') || i.includes('runtime')))
  expect(violations).toHaveLength(0)
})
```

### Cross-User Isolation Tests — mandatory for owned resources

Every repo that scopes queries by `userId` (an owned resource) MUST ship
`tests/integration/{resource}.isolation.test.ts` — copy `isolation.test.template.ts`.
It proves user B gets **404 (not 403)** for user A's resource on read/update/delete/list.
Enforced: `tests/architecture/isolation.test.ts` fails CI if the file is missing.

## Test File Naming
- Unit: `tests/unit/{layer}/{filename}.test.ts`
- Integration: `tests/integration/{feature}.test.ts`
- Isolation: `tests/integration/{resource}.isolation.test.ts` (required per owned resource)
- Architecture: `tests/architecture/layers.test.ts`, `tests/architecture/isolation.test.ts`
