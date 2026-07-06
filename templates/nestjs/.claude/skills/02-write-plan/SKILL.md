# /write-plan
1. Check docs/product-specs/ready/ — stop if empty
2. Get next plan number
3. Write to docs/exec-plans/active/PLAN-XXX-{slug}.md

Layer order for each NestJS feature:
| # | Layer | Gate |
|---|---|---|
| 1 | Model | paranoid, UUIDv7, indexes |
| 2 | Migration | runs clean, has down() |
| 3 | DTOs | class-validator + @ApiProperty on every field |
| 4 | Repository | Zod parse, cursor pagination, ownership, no N+1 |
| 5 | Service | no HTTP, NestJS exceptions, ≥90% coverage |
| 6 | Controller | @ApiTags, @ApiOperation, @ApiResponse, one-liner handlers |
| 7 | Module | SequelizeModule.forFeature, registered in AppModule |
| 8 | Tests | service unit (mock repo) + e2e (201, 401, 422) |

Tell human: Run /build-layer to start Layer 1.
