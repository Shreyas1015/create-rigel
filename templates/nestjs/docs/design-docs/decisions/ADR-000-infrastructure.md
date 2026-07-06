# ADR-000 — Infrastructure & Stack Choices

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** Phase 0

---

## Decisions

### Framework: NestJS 11
- Modular architecture with IoC container built-in
- TypeScript-first with full decorator support
- Global guards, pipes, filters, interceptors
- v11 stable — v12 (ESM + Vitest) targeting Q3 2026, not stable yet

### ORM: Sequelize 6 + sequelize-typescript + @nestjs/sequelize
- Team standard across projects
- @nestjs/sequelize provides SequelizeModule.forRoot + @InjectModel DI
- sequelize-typescript provides TypeScript decorator model definitions
- sequelize-cli for migrations
- Alternatives considered: Prisma (better DX), TypeORM (NestJS native) — Sequelize chosen for consistency

### Auth: @nestjs/passport + passport-jwt + @nestjs/jwt
- NestJS official pattern — JwtStrategy + JwtAuthGuard
- Global guard (APP_GUARD) — every route protected by default
- @Public() decorator for opt-out
- argon2 for password hashing (GPU-resistant, beats bcrypt)

### Validation: class-validator + class-transformer (input), Zod (output)
- class-validator: NestJS native, integrates with ValidationPipe and Swagger
- Zod: output validation on Sequelize .toJSON() at repository boundary
- Two-layer approach: structured validation in, typed safety out

### Config: @nestjs/config + Joi
- ConfigModule with Joi schema — process.exit on invalid config at startup
- ConfigService injected everywhere — no process.env in application code

### Logging: nestjs-pino
- Structured JSON logging via pino
- NestJS lifecycle integration
- Replaces default NestJS logger

### API Docs: @nestjs/swagger
- Auto-generated OpenAPI spec from DTOs and decorators
- Live at /api/docs — no static file sync needed
- Frontend exports via: curl http://localhost:3000/api/docs-json -o openapi.json

### Queue: @nestjs/bullmq
- Official NestJS BullMQ integration
- Redis-backed, most mature queue in Node ecosystem

### Rate Limiting: @nestjs/throttler
- Official NestJS rate limiting
- Applied per-controller or per-route with @Throttle()

### Health: @nestjs/terminus
- Official health checks — /health (liveness) + /ready (DB + Redis)
