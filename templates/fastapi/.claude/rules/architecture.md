---
paths:
  - "src/**/*.py"
---

# Architecture Rules — Auto-injected on every src/ file edit

## Import Order Enforcement

Before writing any import, check which layer you are in:

| Your file is in | You may import from |
|---|---|
| `src/types/` | Nothing (third-party ok: pydantic, enum) |
| `src/config/` | `src/types/` only |
| `src/models/` | `src/types/`, `src/config/` |
| `src/repo/` | `src/types/`, `src/config/`, `src/models/` |
| `src/services/` | `src/types/`, `src/config/`, `src/repo/` |
| `src/runtime/` | `src/types/`, `src/config/`, `src/repo/`, `src/services/` |
| `src/utils/` | Nothing (stdlib + third-party only) |
| `src/providers/` | `src/types/`, `src/config/` only |

## Correct Patterns Per Layer

### Types (`src/types/`)
```python
# ✅ Pure Pydantic schema — no imports from other layers
from pydantic import BaseModel
from enum import Enum

class ApplicationStage(str, Enum):
    SAVED = "SAVED"
    APPLIED = "APPLIED"

class ApplicationResponse(BaseModel):
    id: str
    stage: ApplicationStage

# ❌ Wrong
from src.config.settings import settings   # FORBIDDEN in types
```

### Service (`src/services/`)
```python
# ✅ Takes typed inputs, returns typed outputs, raises DomainError
async def create_application(
    session: AsyncSession,
    user_id: str,
    data: CreateApplicationInput,
) -> ApplicationResponse:
    ...
    raise ApplicationNotFoundError("...")   # Domain error — ok

# ❌ Wrong
from fastapi import HTTPException           # FORBIDDEN in service
raise HTTPException(status_code=404)        # FORBIDDEN — only in runtime
```

### Runtime (`src/runtime/`)
```python
# ✅ Correct handler structure — THIS ORDER always
@router.post("/applications", status_code=201)
async def create_application(
    body: CreateApplicationInput,                    # 1. Pydantic validates
    auth: AuthContext = Depends(require_auth),       # 2. Auth
    session: AsyncSession = Depends(get_session),   # 3. DB session
) -> ApplicationResponse:
    return await application_service.create(session, auth.user_id, body)
    # error mapping handled by global exception handlers — not here

# ❌ Wrong — business logic in handler
@router.post("/applications")
async def create(body: dict, ...):    # untyped body
    if body["stage"] == "APPLIED":   # logic in handler
```

## ruff Configuration
`ruff.toml` enforces:
- `no-print` (T20) — use structlog
- Import order (I) — enforced automatically
- No unused imports (F401)
- Type annotations required (ANN)

Run anytime: `uv run ruff check src/`
