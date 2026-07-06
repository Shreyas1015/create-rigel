---
paths:
  - "src/runtime/**/*.py"
  - "src/repo/**/*.py"
---

# Security Rules — Auto-injected on runtime and repo file edits

## Runtime: Every Protected Route Requires This Structure

```python
@router.get("/{app_id}")
async def get_application(
    app_id: UUID,
    auth: AuthContext = Depends(require_auth),        # 1. Auth FIRST
    session: AsyncSession = Depends(get_session),     # 2. DB session
    _: None = Depends(user_rate_limit),               # 3. Rate limit
) -> ApplicationResponse:
    # 4. Service call with domain types only
    return await application_service.get(session, auth.user_id, app_id)
    # 5. Errors handled by global exception handlers — not here
```

## Repo: Validation at Every Boundary

```python
# ✅ REQUIRED — validate every DB result
async def find_by_id(session: AsyncSession, app_id: UUID, user_id: UUID) -> ApplicationResponse:
    result = await session.execute(
        select(Application).where(
            Application.id == app_id,
            Application.user_id == user_id,   # ownership enforced HERE
            Application.deleted_at.is_(None)
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise ApplicationNotFoundError(f"Application {app_id} not found")
    return ApplicationResponse.model_validate(row.__dict__)

# ❌ FORBIDDEN — no ownership check
row = await session.get(Application, app_id)   # anyone can access

# ❌ FORBIDDEN — raw dict returned
return row.__dict__
```

## SQL Injection Prevention

```python
# ✅ SQLAlchemy ORM — always parameterised
await session.execute(select(Application).where(Application.user_id == user_id))

# ✅ Raw SQL with bound parameters
await session.execute(text("SELECT * FROM applications WHERE user_id = :uid"), {"uid": user_id})

# ❌ BLOCKED — string interpolation
await session.execute(text(f"SELECT * FROM applications WHERE user_id = '{user_id}'"))
```

## Auth — Always via Depends(), Never Inline

```python
# ✅ Provider injected
from src.providers.auth.middleware import require_auth

@router.post("/")
async def create(auth: AuthContext = Depends(require_auth), ...):
    ...

# ❌ Never roll your own inline
token = request.headers.get("Authorization")
payload = jwt.decode(token, os.environ["JWT_SECRET"])  # multiple violations (PyJWT used inline + os.environ)
```

## Error Responses — Never Expose Internals

```python
# ✅ Global exception handler maps DomainError → HTTPException
# In src/runtime/exception_handlers.py:
@app.exception_handler(ApplicationNotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"error": {"code": "NOT_FOUND", "message": str(exc)}})

# ❌ Never in handlers
raise HTTPException(status_code=500, detail=str(exc))   # exposes internals
```

## Password Hashing — argon2id via pwdlib Only

```python
# ✅ pwdlib with argon2id (passlib is BROKEN on Python 3.13+ — never use it)
from pwdlib import PasswordHash
password_hash = PasswordHash.recommended()   # argon2id
hashed = password_hash.hash(plain_password)
verified = password_hash.verify(plain_password, hashed)

# ❌ Never — passlib (broken on 3.13+), bcrypt (GPU-vulnerable), or hashlib
from passlib.context import CryptContext        # FORBIDDEN — broken on Python 3.13+
import hashlib
hashlib.md5(password.encode()).hexdigest()      # FORBIDDEN
```
