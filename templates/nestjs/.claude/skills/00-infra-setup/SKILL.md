# /infra-setup — Phase 0: Full NestJS Scaffold

Triggered by: `/infra-setup`
Run ONCE. If `package.json` exists → abort.

---

## Step 1 — Create NestJS App
```bash
npm install -g @nestjs/cli
nest new . --package-manager npm --strict
```
Select: `npm` as package manager. This creates the NestJS scaffold.

## Step 2 — Install All Dependencies
```bash
# Core
npm install @nestjs/config joi
npm install @nestjs/sequelize sequelize sequelize-typescript pg pg-hstore
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install argon2
npm install nestjs-pino pino-http pino
npm install @nestjs/throttler
npm install @nestjs/swagger
npm install @nestjs/terminus @nestjs/schedule
npm install @nestjs/bullmq bullmq ioredis
npm install class-validator class-transformer
npm install uuid zod
npm install helmet

# Dev
npm install -D @types/passport-jwt @types/sequelize @types/pg
npm install -D @types/node @types/uuid
npm install -D sequelize-cli
npm install -D pino-pretty
```

## Step 3 — Directory Structure
```bash
mkdir -p \
  src/common/{decorators,filters,guards,interceptors,pipes,dto} \
  src/config \
  src/database \
  src/auth/{dto,strategies,guards} \
  src/users/{dto,models} \
  src/health \
  src/prisma \
  db/{migrations,seeders} \
  docs/{product-specs/{draft,ready},exec-plans/{active,completed},design-docs/decisions,generated} \
  test
```

## Step 4 — Configuration Files to Write

### src/config/configuration.ts
Typed config factory returning all env vars. Validated by Joi schema.

### src/config/config.module.ts
```typescript
ConfigModule.forRoot({
  isGlobal: true,
  load: [configuration],
  validationSchema: Joi.object({
    NODE_ENV: Joi.string().valid('development','test','production').default('development'),
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().uri().required(),
    DATABASE_POOL_MAX: Joi.number().default(10),
    DATABASE_POOL_MIN: Joi.number().default(2),
    REDIS_URL: Joi.string().uri().required(),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
    JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
    CORS_ORIGINS: Joi.string().default('http://localhost:3001'),
    LOG_LEVEL: Joi.string().default('info'),
  }),
})
```

### src/database/database.module.ts
```typescript
SequelizeModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    dialect: 'postgres',
    uri: config.getOrThrow('DATABASE_URL'),
    pool: {
      max: config.get('DATABASE_POOL_MAX', 10),
      min: config.get('DATABASE_POOL_MIN', 2),
      acquire: 30_000,
      idle: 10_000,
    },
    dialectOptions: {
      statement_timeout: 5000,
    },
    autoLoadModels: true,
    synchronize: false,
    logging: false,
    benchmark: true,
  }),
})
```

### src/common/decorators/current-user.decorator.ts
`@CurrentUser()` — extracts user from JWT payload on request object.

### src/common/decorators/public.decorator.ts
`@Public()` — metadata marker to skip global JWT guard.

### src/common/decorators/roles.decorator.ts
`@Roles('ADMIN')` — metadata for RolesGuard.

### src/common/guards/jwt-auth.guard.ts
Checks `@Public()` metadata — if present, skip. Otherwise validate JWT.

### src/common/guards/roles.guard.ts
Reads `@Roles()` metadata from reflector, checks user.role.

### src/common/filters/all-exceptions.filter.ts
Global exception filter — maps all exceptions to standard envelope:
`{ statusCode, message, timestamp, path, requestId }`. No stack traces in production.

### src/common/interceptors/logging.interceptor.ts
Global interceptor — logs every request/response via nestjs-pino Logger with duration.

### src/common/dto/pagination.dto.ts
```typescript
export class PaginationDto {
  @IsOptional() @IsString() cursor?: string
  @IsOptional() @IsInt() @Min(1) @Max(100) @Transform(({ value }) => parseInt(value))
  limit?: number = 20
}
```

### src/auth/* — Full JWT auth module
- `JwtStrategy` validates token, checks revocation in Redis, attaches user to request
- `AuthService` — register (argon2.hash), login (argon2.verify), refresh (rotate), logout (revoke)
- `AuthController` — `@Public()` on all auth routes, strict rate limit

### src/health/health.module.ts
```typescript
TerminusModule — /health (liveness) + /ready (DB + Redis checks)
```

### src/utils/uuid.util.ts
```typescript
import { v7 as uuidv7 } from 'uuid'
export const newId = (): string => uuidv7()
```

### main.ts — Global setup
```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
app.useGlobalFilters(new AllExceptionsFilter())
app.useGlobalInterceptors(new LoggingInterceptor())
// JwtAuthGuard registered as APP_GUARD in AppModule providers
// Helmet
app.use(helmet())
// CORS
app.enableCors({ origin: config.get('CORS_ORIGINS').split(','), credentials: true })
// Swagger
const swaggerConfig = new DocumentBuilder()
  .setTitle('API').setVersion('1.0').addBearerAuth().build()
SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig))
// Listen
await app.listen(config.get('PORT', 3000))
```

### .sequelizerc
```javascript
module.exports = {
  'config': 'src/database/sequelize-cli.cjs',
  'migrations-path': 'db/migrations',
  'seeders-path': 'db/seeders',
}
```

### src/database/sequelize-cli.cjs
Loads DATABASE_URL from .env for sequelize-cli.

### Docker
`Dockerfile` — multi-stage: deps → builder → runner, non-root user, HEALTHCHECK.
`docker-compose.yml` — app + postgres:16 + redis:7 with healthchecks.

### GitHub Actions
`.github/workflows/ci.yml` — lint → typecheck → test → npm audit → secret-scan.

### Scaffold Docs
`AGENTS.md`, `ARCHITECTURE.md`, `ADR-000-infrastructure.md`, `docs/product-specs/index.md`,
`docs/exec-plans/tech-debt-tracker.md`, `docs/QUALITY_SCORE.md`, `.env.example`, `.gitignore`.

---

## Gate Check
```bash
npx tsc --noEmit
npx eslint src/ --max-warnings=0
npx jest --no-coverage 2>&1 | tail -5
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## Commit
```bash
git add -A
git commit -m "chore(infra): phase 0 NestJS infrastructure setup

- NestJS 11 + TypeScript 5 strict
- @nestjs/sequelize + sequelize-typescript + sequelize-cli
- Global JWT guard (opt-out with @Public())
- Global ValidationPipe, AllExceptionsFilter, LoggingInterceptor
- nestjs-pino structured logging
- @nestjs/swagger Swagger UI at /api/docs
- @nestjs/terminus health checks (/health + /ready)
- @nestjs/throttler rate limiting
- @nestjs/bullmq queue infrastructure
- Helmet security headers
- Docker multi-stage + docker-compose
- GitHub Actions CI
- ADR-000: infrastructure decisions"
git push origin main
```
