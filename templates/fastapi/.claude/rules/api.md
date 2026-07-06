---
paths:
  - "src/runtime/routers/**/*.py"
---

# API Rules — Auto-injected on router file edits

## Every Route File Checklist

### Versioning
```python
# ✅ All routers under version prefix
router = APIRouter(prefix="/applications", tags=["applications"])
# Mounted in main.py at: app.include_router(router, prefix="/api/v1")

# ❌ Never create unversioned routes
app.include_router(router)   # no version prefix
```

### Required Handler Structure
```python
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_application(
    body: CreateApplicationInput,                       # 1. Pydantic validates body
    auth: AuthContext = Depends(require_auth),          # 2. Auth
    session: AsyncSession = Depends(get_session),      # 3. DB session
    _: None = Depends(user_rate_limit),                # 4. Rate limit
) -> ApplicationResponse:                              # 5. Typed return
    result = await application_service.create(session, auth.user_id, body)
    return result                                      # 6. FastAPI serialises
# Errors → global exception handlers → no try/except here
```

### Rate Limit Tiers
```python
# In src/providers/rate_limit.py — three tiers:
auth_rate_limit  = Depends(...)   # 10/min — login, register, reset
public_rate_limit = Depends(...)  # 60/min — unauthenticated reads
user_rate_limit  = Depends(...)   # 300/min — authenticated endpoints

# Apply at router level for all routes in a router:
router = APIRouter(dependencies=[Depends(user_rate_limit)])
```

### Response Envelope — Always
```python
# ✅ Wrap all responses in SuccessEnvelope
from src.runtime.response_util import ok   # builders live in runtime (utils may not import types)
from src.types.common import SuccessEnvelope

@router.get("/{app_id}")
async def get_application(
    app_id: UUID,
    request: Request,  # for request_id
    auth: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> SuccessEnvelope[ApplicationResponse]:
    result = await application_service.get(session, auth.user_id, app_id)
    return ok(result, request.state.request_id)
# Response: { "ok": true, "data": {...}, "meta": { "request_id": "...", "timestamp": "..." } }

# ✅ For lists — use PageResult wrapped in envelope
@router.get("/")
async def list_applications(
    request: Request,
    ...
) -> SuccessEnvelope[PageResult[ApplicationResponse]]:
    result = await application_service.list(session, auth.user_id, cursor, limit)
    return ok(result, request.state.request_id)
# Response: { "ok": true, "data": { "items": [...], "next_cursor": "...", "has_more": true }, "meta": {...} }

# ❌ Never return bare Pydantic models
@router.get("/{app_id}")
async def get_application(...) -> ApplicationResponse:  # FORBIDDEN
    return await application_service.get(...)  # missing envelope
```

**Error envelope** (handled by global exception handler):
```python
# Errors automatically wrapped by exception_handlers.py:
# { "ok": false, "error": { "code": "NOT_FOUND", "message": "..." }, "meta": {...} }
```

### Pagination Query Params — Opaque Cursor
```python
from src.utils.cursor_util import decode_cursor, encode_cursor

@router.get("/")
async def list_applications(
    cursor: str | None = Query(None),  # opaque base64url-encoded cursor
    limit: int = Query(default=20, ge=1, le=100),
    auth: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> SuccessEnvelope[PageResult[ApplicationResponse]]:
    decoded_cursor = decode_cursor(cursor) if cursor else None
    # decoded_cursor = {"id": uuid, "created_at": iso_str} or None
    result = await application_service.list(session, auth.user_id, decoded_cursor, limit)
    return ok(result, request.state.request_id)

# ❌ Never expose dual cursor params (leaks implementation details)
@router.get("/")
async def list_applications(
    cursor_id: UUID | None = Query(None),           # FORBIDDEN
    cursor_created_at: datetime | None = Query(None),  # FORBIDDEN
    ...
```

**Cursor encoding** (in service layer):
```python
# Service returns PageResult with next_cursor as opaque string
from src.utils.cursor_util import encode_cursor

next_cursor = encode_cursor({"id": str(last_item.id), "created_at": last_item.created_at.isoformat()})
return PageResult(items=items, next_cursor=next_cursor, has_more=has_more)
```

### Security Headers
Applied globally in `main.py` via middleware — never per-route.
Verify `SecurityHeadersMiddleware` is in the middleware stack.
