# CLAUDE.md — Agent Entry Point

Stack: NestJS 11 · TypeScript 5 strict · Sequelize 6 + sequelize-typescript · PostgreSQL · Redis · BullMQ

---

## Cardinal Rules

1. **Read the active plan first** — `docs/exec-plans/active/`
2. **No plan = no code** — run `/write-spec` then `/write-plan` first
3. **Gate must PASS before commit** — auto-fix, re-run, then commit
4. **One layer at a time** — complete + gate + commit before next
5. **No `process.env`** — use `ConfigService` injected via NestJS DI
6. **No `HttpException` in services** — use `NotFoundException`, `ConflictException` etc.
7. **No `@InjectModel()` in services** — inject the repository, not the model
8. **Zod parse every `.toJSON()`** — in repository only, every time

---

## Session Start Checklist

```
1. ls docs/exec-plans/active/    → active plan?
2. If yes  → read it → find first [ ] layer → /build-layer
3. If no   → ask human what to build → /write-spec
```

---

## NestJS-Specific Patterns

### Config — always ConfigService, never process.env
```typescript
// ✅ Inject ConfigService
constructor(private config: ConfigService) {}
const secret = this.config.get<string>('JWT_SECRET')

// ❌ Never
const secret = process.env.JWT_SECRET
```

### Auth — global guard, opt-out with @Public()
```typescript
// ✅ Public route
@Public()
@Post('register')
register(@Body() dto: RegisterDto) { ... }

// ✅ Protected (no decoration needed — global guard handles it)
@Get('me')
getProfile(@CurrentUser() user: JwtPayload) { ... }
```

### Service exceptions — NestJS built-ins only
```typescript
// ✅
throw new NotFoundException(`Application ${id} not found`)
throw new ConflictException('Invalid stage transition')

// ❌
throw new HttpException('not found', 404)
```

### Repository — Zod on every output
```typescript
// ✅
const raw = await this.appModel.findOne({ where: { id, userId } })
if (!raw) throw new NotFoundException(`Application ${id} not found`)
return ApplicationSchema.parse(raw.toJSON())

// ❌
return raw                    // raw Sequelize instance
return raw.toJSON() as App    // cast without validation
```

### Controller — one-liners only
```typescript
// ✅
@Get(':id')
@ApiOperation({ summary: 'Get application by ID' })
@ApiOkResponse({ type: ApplicationResponseDto })
findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.applicationService.findOne(user.sub, id)
}

// ❌ Business logic in controller
@Get(':id')
async findOne(@Param('id') id: string) {
  const app = await this.service.findOne(id)
  if (app.stage === 'CANCELLED') { ... }  // logic belongs in service
}
```

### Logging — Logger, not console
```typescript
// ✅
private readonly logger = new Logger(ApplicationService.name)
this.logger.log({ event: 'application.created', id: app.id })

// ❌
console.log('created', app.id)
```

---

## Stack Reference

```
Framework:  NestJS 11, Node 22, TypeScript 5 strict
ORM:        Sequelize 6 + sequelize-typescript + sequelize-cli
Auth:       @nestjs/passport + passport-jwt + @nestjs/jwt
Password:   argon2
Config:     @nestjs/config + joi
Logging:    nestjs-pino + pino
Queue:      @nestjs/bullmq + bullmq + ioredis
Rate limit: @nestjs/throttler
API docs:   @nestjs/swagger (live at /api/docs)
Health:     @nestjs/terminus (/health + /ready)
Validation: class-validator + class-transformer (input) + zod (output)
Testing:    Jest + Supertest (NestJS default)
```
