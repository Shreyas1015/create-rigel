# PLANS.md — Execution Plan Format

## Lifecycle
/write-plan → docs/exec-plans/active/PLAN-XXX.md
  → /build-layer (each NestJS layer: Model → Migration → DTOs → Repository → Service → Controller → Module → Tests)
  → /garbage-collect → docs/exec-plans/completed/

Plans are NEVER deleted.

## NestJS Layer Order (per feature)
1. Model (sequelize-typescript class)
2. Migration (sequelize-cli)
3. DTOs (class-validator + @ApiProperty)
4. Repository (@InjectModel + Zod parse)
5. Service (@Injectable, NestJS exceptions)
6. Controller (@Controller, Swagger decorators)
7. Module (SequelizeModule.forFeature, wire everything)
8. Tests (jest unit + supertest e2e)

## Escalation Rule
Escalate only for: ambiguous requirements, security decisions with no pattern, architecture change needed.
Never escalate for: TypeScript errors, linter failures, test failures.
