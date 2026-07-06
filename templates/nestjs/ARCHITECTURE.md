# ARCHITECTURE.md — NestJS Layered Architecture

Stack: NestJS 11 · TypeScript 5 · Sequelize 6 + sequelize-typescript · PostgreSQL

---

## Module Dependency Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  Common (src/common/)                                             │
│  ├─ Guards:       JwtAuthGuard (global), RolesGuard              │
│  ├─ Decorators:   @CurrentUser(), @Public(), @Roles()            │
│  ├─ Filters:      AllExceptionsFilter (global)                   │
│  ├─ Interceptors: LoggingInterceptor (global)                    │
│  └─ DTOs:         PaginationDto (shared cursor params)           │
│                                                                   │
│  Config (src/config/)                                             │
│  └─ ConfigModule with Joi validation — ConfigService everywhere  │
│                                                                   │
│  Database (src/database/)                                         │
│  └─ SequelizeModule.forRoot() — connection + pool config         │
│                                                                   │
│  [Feature] Module (src/[feature]/)                               │
│  ├─ models/[feature].model.ts   ← Sequelize model (schema)      │
│  ├─ dto/                        ← class-validator + @ApiProperty │
│  ├─ [feature].repository.ts     ← @InjectModel + Zod parse      │
│  ├─ [feature].service.ts        ← business logic only            │
│  ├─ [feature].controller.ts     ← thin, Swagger decorators       │
│  └─ [feature].module.ts         ← wires everything               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer Definitions

### Model (`src/[feature]/models/`)

- Sequelize-typescript class with `@Table`, `@Column` decorators
- Schema definition only — **no logic, no methods**
- `@Table({ paranoid: true })` on every model (soft delete)
- `@Default(() => newId())` on every `id` column (UUIDv7)
- Indexes defined in `@Table({ indexes: [] })`
- Imports: Types only

### DTOs (`src/[feature]/dto/`)

- `class-validator` + `class-transformer` decorated classes
- Every field has `@ApiProperty()` for Swagger
- Input DTOs: `Create*Dto`, `Update*Dto`
- Response DTOs: `*ResponseDto` (controls what is serialised)
- **No logic** — only property definitions and validation decorators

### Repository (`src/[feature]/[feature].repository.ts`)

- `@Injectable()` class with `@InjectModel(Model)` in constructor
- **Only place DB queries happen**
- Every `.toJSON()` result passed through `ZodSchema.parse()`
- Cursor-based pagination on all list methods
- Ownership enforced in every `WHERE` clause (`userId` filter)
- Exports only typed domain objects — never raw Sequelize instances

### Service (`src/[feature]/[feature].service.ts`)

- `@Injectable()` class — business logic only
- Injects repository class (not the model directly)
- **No HTTP types** — no `Request`, `Response`, `@nestjs/common` HTTP imports
- **No `HttpException`** — uses NestJS built-in semantic exceptions:
  - `NotFoundException`, `ConflictException`, `UnauthorizedException`, `ForbiddenException`, `BadRequestException`
- Multi-step operations wrapped in `sequelize.transaction()`

### Controller (`src/[feature]/[feature].controller.ts`)

- `@Controller()` class — routing and serialisation only
- **Zero business logic** — each handler is a one-liner delegating to service
- Required Swagger decorators on every class and route:
  - `@ApiTags()`, `@ApiBearerAuth()`, `@ApiOperation()`, `@ApiResponse()`
- `@UseGuards()` only if route-level guard needed (not for JWT — that's global)
- `@Roles('ADMIN')` for admin-only routes

### Module (`src/[feature]/[feature].module.ts`)

- Wires: `SequelizeModule.forFeature([Model])`, repository, service, controller
- Exports services that other modules need
- Imported in `AppModule` (or parent module)

---

## Import Rules (ESLint enforces)

```
Model         →  Types only
DTOs          →  Types only (class-validator, swagger decorators)
Repository    →  Model, Config, Types, Zod
Service       →  Repository, Config, Types — NO HTTP imports
Controller    →  Service, DTOs, Common decorators
Module        →  All of the above
Common        →  Config, Types only
```

**Forbidden:**

- `process.env` anywhere (use `ConfigService`)
- `console.log` anywhere (use `Logger` or `nestjs-pino`)
- `HttpException` in services (use built-in semantic exceptions)
- Business logic in controllers
- `@InjectModel()` in services (inject repository instead)
- Raw Sequelize instance returned from repository (always `.toJSON()` + Zod)

---

## Auth Model — Opt-Out, Not Opt-In

```typescript
// main.ts — JWT guard applied GLOBALLY
app.useGlobalGuards(new JwtAuthGuard(reflector))

// Public routes use @Public() decorator
@Public()
@Post('login')
login(@Body() dto: LoginDto) { ... }

// Protected routes need NO guard decoration — they're protected by default
@Get('profile')
getProfile(@CurrentUser() user: JwtPayload) { ... }

// Admin routes add @Roles()
@Roles('ADMIN')
@Delete(':id')
delete(@Param('id') id: string) { ... }
```

---

## Validation Model

```
HTTP Request
    │
    ▼ Global ValidationPipe (whitelist: true, transform: true)
    │   → class-validator validates DTO
    │   → strips unknown fields
    │   → transforms types (string → number etc.)
    ▼
Controller → Service → Repository
                           │
                           ▼ Sequelize query
                           │
                           ▼ .toJSON()
                           │
                           ▼ ZodSchema.parse() ← output validation boundary
                           │
                        TypedResult
```

---

## NestJS Exception Map

| NestJS Exception               | HTTP Status | When to use                                             |
| ------------------------------ | ----------- | ------------------------------------------------------- |
| `NotFoundException`            | 404         | Resource not found                                      |
| `ConflictException`            | 409         | Duplicate, invalid state transition                     |
| `UnauthorizedException`        | 401         | Invalid credentials, expired token                      |
| `ForbiddenException`           | 403         | Insufficient permissions                                |
| `BadRequestException`          | 400         | Invalid input (caught before service by ValidationPipe) |
| `InternalServerErrorException` | 500         | Unexpected failure                                      |

---

## File Size Limit

**400 lines maximum** per file. Enforced by PostToolUse hook + gate-checker.

---

## Naming Conventions

| Thing        | Pattern               | Example                           |
| ------------ | --------------------- | --------------------------------- |
| Model        | `*.model.ts`          | `application.model.ts`            |
| Repository   | `*.repository.ts`     | `application.repository.ts`       |
| Service      | `*.service.ts`        | `application.service.ts`          |
| Controller   | `*.controller.ts`     | `application.controller.ts`       |
| Module       | `*.module.ts`         | `application.module.ts`           |
| Create DTO   | `create-*.dto.ts`     | `create-application.dto.ts`       |
| Update DTO   | `update-*.dto.ts`     | `update-application.dto.ts`       |
| Response DTO | `*-response.dto.ts`   | `application-response.dto.ts`     |
| Zod schemas  | `*Schema`             | `ApplicationSchema`               |
| Migration    | `YYYYMMDDHHMMSS-*.js` | `20260508-create-applications.js` |
