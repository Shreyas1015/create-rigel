---
paths:
  - "src/**/*.spec.ts"
  - "test/**/*.spec.ts"
  - "test/**/*.e2e-spec.ts"
---

# Testing Rules — Auto-injected on test file edits

## Coverage Thresholds (enforced in CI)

| Layer | Threshold |
|---|---|
| Services | **90%** — happy path + all error paths |
| Repositories | **80%** — queries, Zod parse, cursor pagination |
| Controllers | **75%** — via E2E: 201, 401, 422, 404 |
| Utils/Common | **100%** — every branch |

## Service Unit Tests — Mock the Repository

```typescript
// src/applications/application.service.spec.ts
import { Test } from '@nestjs/testing'
import { ApplicationService } from './application.service'
import { ApplicationRepository } from './application.repository'
import { NotFoundException, ConflictException } from '@nestjs/common'

describe('ApplicationService', () => {
  let service: ApplicationService
  let repo: jest.Mocked<ApplicationRepository>

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ApplicationService,
        {
          provide: ApplicationRepository,
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            list: jest.fn(),
            updateStage: jest.fn(),
            softDelete: jest.fn(),
          },
        },
      ],
    }).compile()

    service = module.get(ApplicationService)
    repo    = module.get(ApplicationRepository)
  })

  describe('findOne', () => {
    it('returns application when found', async () => {
      repo.findById.mockResolvedValue(mockApplication)
      const result = await service.findOne('user-1', 'app-1')
      expect(result).toEqual(mockApplication)
    })

    it('propagates NotFoundException from repository', async () => {
      repo.findById.mockRejectedValue(new NotFoundException())
      await expect(service.findOne('user-1', 'bad-id')).rejects.toThrow(NotFoundException)
    })
  })

  describe('transitionStage', () => {
    it('throws ConflictException on invalid transition', async () => {
      repo.findById.mockResolvedValue({ ...mockApplication, stage: 'ACCEPTED' })
      await expect(service.transitionStage('user-1', 'app-1', 'APPLIED'))
        .rejects.toThrow(ConflictException)
    })
  })
})
```

## E2E Tests — Full HTTP Stack

```typescript
// test/applications.e2e-spec.ts
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { INestApplication, ValidationPipe } from '@nestjs/common'

describe('ApplicationController (e2e)', () => {
  let app: INestApplication
  let token: string

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()

    // Register + login to get token
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'test@test.com', password: 'password123' })
    token = res.body.data.tokens.accessToken
  })

  afterAll(() => app.close())

  it('POST /v1/applications — 201 with valid body', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'Acme', role: 'Engineer' })

    expect(res.status).toBe(201)
    expect(res.body.data).toHaveProperty('id')
    expect(res.body.data.stage).toBe('SAVED')
  })

  it('POST /v1/applications — 401 without token', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/applications')
      .send({ company: 'Acme', role: 'Engineer' })
    expect(res.status).toBe(401)
  })

  it('POST /v1/applications — 422 with invalid body', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'Engineer' })  // missing company
    expect(res.status).toBe(422)
  })
})
```

## NestJS TestingModule Pattern
```typescript
// Always use Test.createTestingModule — never instantiate classes directly
const module = await Test.createTestingModule({
  providers: [
    MyService,
    { provide: MyRepository, useValue: mockRepo },
    { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
  ],
}).compile()
```
