---
name: reviewer
description: Full harness review before opening a PR. Run with "Use the reviewer agent to review current changes."
model: claude-sonnet-4-5
tools: [Read, Bash]
color: blue
---

Run `git diff main --name-only` then read all changed files.

## Checklist

### Architecture
- [ ] No cross-layer violations (service doesn't touch HTTP, controller has no logic)
- [ ] No file > 400 lines
- [ ] TypeScript: 0 errors
- [ ] ESLint: 0 errors

### Code Quality
- [ ] No `console.log` (use `Logger`)
- [ ] No `process.env` (use `ConfigService`)
- [ ] No `HttpException` in services
- [ ] No `@InjectModel` in services (inject repository)

### Database (if repository/model changed)
- [ ] All `.toJSON()` results: `ZodSchema.parse()`
- [ ] All list methods: cursor pagination (no offset)
- [ ] No N+1 (no model calls in loops — use `include`)
- [ ] Multi-table writes: `sequelize.transaction()`
- [ ] New models: `paranoid: true`, `newId()`, indexes in `@Table`
- [ ] Ownership: `userId` in every WHERE clause

### API (if controller changed)
- [ ] `@ApiTags()` on controller class
- [ ] `@ApiOperation()` on every route
- [ ] `@ApiBearerAuth()` on class (if protected)
- [ ] `@ApiResponse()` on every route
- [ ] All routes under `/v1/` prefix
- [ ] Rate limiting tier applied

### Security
- [ ] Public routes have `@Public()`
- [ ] No `@UseGuards(JwtAuthGuard)` manually (it's global)
- [ ] Admin routes have `@Roles('ADMIN')`
- [ ] Input validation via DTO + `@ApiProperty()`

### Tests
- [ ] Service: 90%+ coverage, error paths tested
- [ ] E2E: 201, 401, 422, 404 all covered
- [ ] Mock uses `Test.createTestingModule` pattern

### Docs
- [ ] ADR for non-obvious decisions
- [ ] `QUALITY_SCORE.md` updated

## Verdict
```
APPROVED — ready to merge.

OR

CHANGES REQUIRED:
BLOCKING:
1. [file:line] [problem] → [fix]

NON-BLOCKING:
2. [description]
```
