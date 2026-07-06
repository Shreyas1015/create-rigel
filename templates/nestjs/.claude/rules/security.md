---
paths:
  - "src/**/*.controller.ts"
  - "src/**/*.repository.ts"
  - "src/auth/**/*.ts"
---

# Security Rules — Auto-injected on controller/repository/auth edits

## Auth — Global Guard, Opt-Out Model

```typescript
// ✅ Public routes must have @Public()
@Public()
@Post('login')
login(@Body() dto: LoginDto) { ... }

// ✅ Protected routes have NOTHING — global guard handles it
@Get('me')
getProfile(@CurrentUser() user: JwtPayload) { ... }

// ❌ Never add @UseGuards(JwtAuthGuard) manually — it's global
@UseGuards(JwtAuthGuard)  // redundant and misleading
@Get('me')
getProfile() { ... }
```

## Ownership — Enforced in Repository

```typescript
// ✅ userId ALWAYS in WHERE clause
const raw = await this.appModel.findOne({
  where: { id, userId }  // userId from auth context — never from user input
})

// ❌ No ownership check — any user can access any record
const raw = await this.appModel.findByPk(id)
```

## Input Validation — DTOs + ValidationPipe

```typescript
// ✅ ValidationPipe global (main.ts) + class-validator on DTO
export class CreateApplicationDto {
  @IsString() @MinLength(1) @MaxLength(200)
  @ApiProperty({ example: 'Acme Corp' })
  company: string

  @IsOptional() @IsUrl()
  @ApiProperty({ required: false })
  postingUrl?: string
}

// ❌ Never accept raw body without DTO
@Post() create(@Body() body: any) { ... }  // FORBIDDEN
```

## SQL Injection Prevention

```typescript
// ✅ Sequelize ORM parameterises automatically
await this.appModel.findAll({ where: { userId, stage } })

// ✅ Raw queries with named replacements
await sequelize.query(
  'SELECT * FROM applications WHERE user_id = :userId',
  { replacements: { userId }, type: QueryTypes.SELECT }
)

// ❌ String interpolation — FORBIDDEN
await sequelize.query(`SELECT * FROM applications WHERE user_id = '${userId}'`)
```

## Password Hashing — argon2 Only

```typescript
import * as argon2 from 'argon2'

// Hash
const hash = await argon2.hash(password)

// Verify
const valid = await argon2.verify(hash, password)

// ❌ Never
import * as bcrypt from 'bcrypt'   // GPU-vulnerable
```

## Error Responses — Never Expose Internals

```typescript
// ✅ AllExceptionsFilter in common/ catches all — sanitised output
// { statusCode, message, timestamp, path } — no stack traces

// ✅ Throw semantic NestJS exceptions
throw new NotFoundException('Application not found')
throw new ConflictException('Stage transition invalid')

// ❌ Never expose internal errors
res.json({ error: err.message, stack: err.stack })
```

## JWT Tokens

```typescript
// Access token: 15 minutes — from ConfigService
// Refresh token: 7 days — single use, rotated on refresh
// Revocation: Redis key `revoked:{jti}` — checked in JwtStrategy.validate()
// Tokens in response body — never in cookies (frontend handles storage)
```
