---
paths:
  - "src/**/*.ts"
---

# Architecture Rules — Auto-injected on every src/ file edit

## Import Hierarchy (one-way, enforced)

| Your file | May import from |
|---|---|
| `*.model.ts` | Types, sequelize-typescript decorators only |
| `*.dto.ts` | class-validator, @nestjs/swagger, Types only |
| `*.repository.ts` | Model, Config (ConfigService), Types, Zod |
| `*.service.ts` | Repository, Config, Types — NO HTTP imports |
| `*.controller.ts` | Service, DTOs, Common decorators, @nestjs/common |
| `*.module.ts` | All of the above |
| `src/common/**` | Config, Types only |

## Model Rules
```typescript
// ✅ Model = schema only
@Table({ tableName: 'applications', paranoid: true })
export class Application extends Model {
  @Default(() => newId())
  @Column({ type: DataType.UUID, primaryKey: true })
  id!: string

  // ❌ Never add methods with business logic to models
  // getActiveStages() { ... }  ← WRONG, belongs in service
}
```

## Repository Rules
```typescript
// ✅ Always validate output with Zod
async findById(id: string, userId: string): Promise<ApplicationRecord> {
  const raw = await this.appModel.findOne({ where: { id, userId } })
  if (!raw) throw new NotFoundException(`Application ${id} not found`)
  return ApplicationSchema.parse(raw.toJSON())   // REQUIRED
}

// ❌ Never return raw Sequelize instances
async findById(id: string): Promise<Application> {
  return this.appModel.findByPk(id)  // WRONG — unvalidated, exposes ORM internals
}

// ✅ Ownership in every query
where: { id, userId }    // userId always from auth context, never from user input

// ✅ Cursor pagination on all list methods
async list(userId: string, cursor?: PageCursor, limit = 20) {
  const where: WhereOptions = { userId }
  if (cursor) {
    where[Op.or] = [
      { createdAt: { [Op.lt]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
    ]
  }
  // ...
}
```

## Service Rules
```typescript
// ✅ Takes typed inputs, returns typed outputs, throws semantic exceptions
async createApplication(userId: string, dto: CreateApplicationDto): Promise<ApplicationRecord> {
  return this.applicationRepository.create(userId, dto)
}

// ❌ No HTTP types in service
import { Request } from 'express'        // FORBIDDEN
throw new HttpException('error', 404)   // FORBIDDEN — use NotFoundException
```

## Controller Rules
```typescript
// ✅ One-liner handlers only
@Post()
@ApiOperation({ summary: 'Create application' })
@ApiCreatedResponse({ type: ApplicationResponseDto })
create(@Body() dto: CreateApplicationDto, @CurrentUser() user: JwtPayload) {
  return this.applicationService.createApplication(user.sub, dto)
}

// ✅ Swagger on every route — no exceptions
// Every controller class: @ApiTags('Applications') @ApiBearerAuth()
// Every handler: @ApiOperation() + @ApiResponse() or @ApiOkResponse()

// ❌ Logic in controllers
create(@Body() dto: CreateApplicationDto) {
  if (dto.stage === 'APPLIED') { ... }  // WRONG — belongs in service
}
```

## ConfigService Pattern
```typescript
// ✅ Always inject ConfigService
constructor(private config: ConfigService) {}
const jwtSecret = this.config.getOrThrow<string>('JWT_SECRET')

// ❌ Never
process.env.JWT_SECRET
```
