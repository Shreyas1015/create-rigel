---
paths:
  - "tests/**/*.py"
---

# Testing Rules — Auto-injected on test file edits

## Coverage Thresholds (enforced in CI)

| Layer | Threshold | What to test |
|---|---|---|
| `src/utils/` | **100%** | Every branch, every edge case |
| `src/services/` | **90%** | Happy path + all error paths + state machines |
| `src/repo/` | **80%** | Query results, model_validate, ownership, cursor pagination |
| `src/runtime/routers/` | **75%** | Auth required, 422 validation, 404, 422 |
| `src/providers/` | **70%** | Core functionality |

## Required Test Patterns

### Service Tests — error paths mandatory
```python
import pytest
from src.services.application_service import ApplicationService
from src.types.exceptions import StageTransitionError, TerminalStageError

@pytest.mark.asyncio
async def test_transition_stage_invalid_raises(session, user_id, app_id):
    with pytest.raises(StageTransitionError):
        await ApplicationService.transition_stage(session, user_id, app_id, "ACCEPTED")

@pytest.mark.asyncio
async def test_transition_from_terminal_raises(session, user_id, accepted_app_id):
    with pytest.raises(TerminalStageError):
        await ApplicationService.transition_stage(session, user_id, accepted_app_id, "APPLIED")

@pytest.mark.asyncio
async def test_ownership_enforced(session, other_user_id, app_id):
    with pytest.raises(ApplicationNotFoundError):
        await ApplicationService.get(session, other_user_id, app_id)
```

### Route Tests — test HTTP contract
```python
@pytest.mark.asyncio
async def test_create_application_requires_auth(async_client: AsyncClient):
    response = await async_client.post("/api/v1/applications", json={...})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_create_application_validates_body(auth_client: AsyncClient):
    response = await auth_client.post("/api/v1/applications", json={"role": "Engineer"})
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_create_application_returns_envelope(auth_client: AsyncClient):
    response = await auth_client.post("/api/v1/applications", json=valid_body)
    assert response.status_code == 201
    body = response.json()
    # All responses are enveloped: { ok, data, meta } — see .claude/rules/api.md
    assert body["ok"] is True
    assert "request_id" in body["meta"]
    data = body["data"]
    assert "id" in data
    assert "stage" in data
```

### Pydantic Schema Tests
```python
def test_create_input_rejects_missing_company():
    with pytest.raises(ValidationError):
        CreateApplicationInput(role="Engineer")   # missing company

def test_stage_enum_rejects_invalid():
    with pytest.raises(ValidationError):
        ApplicationResponse(stage="PENDING", ...)   # not a valid stage
```

### Architecture Tests
```python
# tests/architecture/test_layers.py
import ast, pathlib

def get_imports(filepath: pathlib.Path) -> list[str]:
    # NOTE: ast.Import has NO .module attribute (only ast.ImportFrom does).
    # Handling them together as `node.module` raises AttributeError on any
    # plain `import x` statement — the test would crash, not enforce. Split them.
    tree = ast.parse(filepath.read_text())
    out: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            out.append(node.module or "")
        elif isinstance(node, ast.Import):
            out.extend(alias.name for alias in node.names)
    return out

def test_service_does_not_import_fastapi():
    services = pathlib.Path("src/services").rglob("*.py")
    for f in services:
        imports = get_imports(f)
        assert not any("fastapi" in i for i in imports), \
            f"{f} imports fastapi — services must not depend on HTTP layer"

def test_utils_has_no_domain_imports():
    utils = pathlib.Path("src/utils").rglob("*.py")
    domain = ["src.types", "src.config", "src.models", "src.repo", "src.services", "src.runtime"]
    for f in utils:
        imports = get_imports(f)
        for imp in imports:
            assert not any(d in imp for d in domain), \
                f"{f} imports domain code: {imp}"
```

## conftest.py Fixtures Required

- `session` — async SQLAlchemy session (test DB, auto-rollback)
- `async_client` — httpx `AsyncClient` unauthenticated
- `auth_client` — httpx `AsyncClient` with valid Bearer token
- `user_id` — seeded test user UUID
- `login_as(user_id: UUID)` — helper that returns AsyncClient with token for specific user

---

## Required Integration Tests

### Cross-User Isolation Test (CRITICAL — security boundary)

```python
# tests/integration/test_cross_user_isolation.py
import pytest
from uuid import uuid4
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_user_cannot_access_other_user_resource(
    session,
    login_as,  # fixture from conftest.py
):
    """User B attempting to access User A's resource returns 404 (not 403)."""
    user_a_id = uuid4()
    user_b_id = uuid4()
    
    # User A creates a resource
    client_a = await login_as(user_a_id)
    response = await client_a.post("/api/v1/applications", json={
        "company": "Acme Corp",
        "role": "Engineer",
    })
    assert response.status_code == 201
    resource_id = response.json()["data"]["id"]
    
    # User B attempts to GET User A's resource
    client_b = await login_as(user_b_id)
    response = await client_b.get(f"/api/v1/applications/{resource_id}")
    assert response.status_code == 404  # NOT 403 (don't leak existence)
    assert response.json()["error"]["code"] == "NOT_FOUND"
    
    # User B attempts to UPDATE User A's resource
    response = await client_b.patch(f"/api/v1/applications/{resource_id}", json={
        "stage": "INTERVIEWING",
    })
    assert response.status_code == 404
    
    # User B attempts to DELETE User A's resource
    response = await client_b.delete(f"/api/v1/applications/{resource_id}")
    assert response.status_code == 404
```

**Why 404 not 403?** Returning 403 leaks the existence of the resource (user can enumerate UUIDs to discover other users' data). 404 reveals nothing.

### GDPR Deletion Test

```python
# tests/integration/test_gdpr_deletion.py
import pytest
from src.utils.gdpr_delete_util import gdpr_delete_user

@pytest.mark.asyncio
async def test_gdpr_delete_anonymizes_pii_keeps_audit(session, user_id):
    """GDPR deletion anonymizes PII, hard-deletes sensitive rows, keeps audit logs."""
    # Setup: User has applications, payments, audit logs
    # (create test data here)
    
    # Execute GDPR deletion
    await gdpr_delete_user(session, user_id)
    await session.commit()
    
    # Assertions:
    # 1. User PII anonymized
    user = await session.get(User, user_id)
    assert user.email == f"deleted-{user_id}@gdpr.local"
    assert user.name == "Deleted User"
    assert user.deleted_at is not None
    
    # 2. Sensitive data hard-deleted (payments)
    from src.models.payment import Payment
    payments = await session.execute(
        select(Payment).where(Payment.user_id == user_id)
    )
    assert payments.scalars().all() == []
    
    # 3. Audit logs KEPT (compliance requirement)
    from src.models.audit_log import AuditLog
    logs = await session.execute(
        select(AuditLog).where(AuditLog.user_id == user_id)
    )
    assert len(logs.scalars().all()) > 0  # audit trail preserved
```
