---
paths:
  - "src/**/*.controller.ts"
---

# API Rules — Auto-injected on controller file edits

## Every Controller Checklist

### Required Class Decorators
```typescript
@ApiTags('Applications')         // ← group in Swagger UI
@ApiBearerAuth()                 // ← shows auth in Swagger
@Controller('v1/applications')   // ← always under v1/ prefix
export class ApplicationController {
  constructor(private readonly appService: ApplicationService) {}
```

### Required Method Decorators (every route)
```typescript
@Get(':id')
@ApiOperation({ summary: 'Get application by ID' })
@ApiOkResponse({ type: ApplicationResponseDto })
@ApiNotFoundResponse({ description: 'Application not found' })
findOne(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.appService.findOne(user.sub, id)  // ← one-liner
}
```

### Rate Limiting Tiers
```typescript
// On controller or method level:
@Throttle({ default: { limit: 10, ttl: 60000 } })   // Auth: 10/min
@Throttle({ default: { limit: 60, ttl: 60000 } })   // Public: 60/min
@Throttle({ default: { limit: 300, ttl: 60000 } })  // User: 300/min (default)
```

### Route Versioning (all routes under v1/)
```typescript
// ✅ v1 prefix in controller
@Controller('v1/applications')

// OR use versioning module:
// main.ts: app.enableVersioning({ type: VersioningType.URI })
// @Controller({ path: 'applications', version: '1' })

// ❌ Never unversioned
@Controller('applications')
```

### Pagination Response
```typescript
@Get()
@ApiOkResponse({ description: 'Paginated list' })
list(
  @Query() query: PaginationDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.appService.list(user.sub, query.cursor, query.limit)
}
// Response: { items: [...], nextCursor: string | null, hasMore: boolean }
```

### Public Routes
```typescript
@Public()                                           // ← bypass JWT guard
@Throttle({ default: { limit: 10, ttl: 60000 } }) // ← strict rate limit on auth
@Post('register')
@ApiOperation({ summary: 'Register new account' })
@ApiCreatedResponse({ type: AuthResultDto })
register(@Body() dto: RegisterDto) {
  return this.authService.register(dto)
}
```

### Admin Routes
```typescript
@Roles('ADMIN')    // ← requires ADMIN role
@Delete(':id')
@ApiOperation({ summary: 'Admin: delete any resource' })
adminDelete(@Param('id', ParseUUIDPipe) id: string) {
  return this.appService.adminDelete(id)
}
```
