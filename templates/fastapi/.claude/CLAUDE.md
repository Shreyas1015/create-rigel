# CLAUDE.md — Agent Entry Point

You are an agent-first backend engineer on a Python + FastAPI + SQLAlchemy project.
Read this file first on every session. Then read the active execution plan before touching any code.

---

## Cardinal Rules

1. **Read the active plan first** — `docs/exec-plans/active/`
2. **If no plan exists** — run `/write-roadmap` (whole product) or `/write-spec` (one feature), then `/write-plan`, before any code
3. **Never write code without a plan**
4. **Gate must PASS before commit** — auto-fix failures, re-run gate
5. **One layer at a time** — complete + gate + commit before the next
6. **`raise HTTPException` only in runtime layer** — services raise `DomainError`

---

## Session Start Checklist

```
1. ls docs/exec-plans/active/     → active plan?
2. If yes  → read it, find first [ ] layer, run /build-layer
3. If no   → ask human: whole product or one feature?
             whole product → /write-roadmap   |   one feature → /write-spec
```

---

## The Layer Build Loop (automated by /build-layer)

```
Read active plan → find first [ ] layer
  → load path-scoped rules for that layer
  → write the layer files
  → run gate-checker agent
  → if FAIL: auto-fix all items, log fixes, re-run (max 3 attempts)
  → if PASS: tick checkbox, write ADR if needed, commit, push
  → present summary → WAIT for human confirmation
```

---

## Python-Specific Rules

### Validation at every DB boundary
```python
# ✅ REQUIRED
row = await session.get(Application, app_id)
return ApplicationResponse.model_validate(row.__dict__)

# ❌ FORBIDDEN
return row.__dict__          # unvalidated
return dict(row.__dict__)    # unvalidated cast
```

### Services never raise HTTPException
```python
# ✅ Service layer
raise ApplicationNotFoundError(f"Application {app_id} not found")

# ❌ Service layer — FORBIDDEN
raise HTTPException(status_code=404, detail="Not found")
```

### Async sessions via Depends — never imported directly in service
```python
# ✅ Runtime injects session
@router.get("/{app_id}")
async def get_application(
    app_id: UUID,
    auth: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    return await application_service.get(session, auth.user_id, app_id)

# ❌ Service never creates its own session
async def get(self, app_id: UUID):
    async with AsyncSessionLocal() as session:  # FORBIDDEN in service
```

---

## Stack Reference

```
Runtime:     Python 3.14, FastAPI 0.115, uvicorn 0.32
ORM:         SQLAlchemy 2 (async), Alembic, asyncpg
Auth:        PyJWT 2.9 (JWT RS256/HS256), pwdlib[argon2] (argon2id hashing)
Queue:       Celery 5 + Redis
Cache:       redis-py 5
Logging:     structlog 24
Tracing:     opentelemetry-sdk
Validation:  pydantic v2, pydantic-settings v2
HTTP client: httpx + tenacity
Rate limit:  slowapi + limits (Redis store)
Testing:     pytest 8, pytest-asyncio, httpx AsyncClient, bandit
Tooling:     uv, ruff, mypy, pre-commit
```

---

## Quick Reference

| Thing | Location |
|---|---|
| Navigation map | `AGENTS.md` |
| Layer rules | `ARCHITECTURE.md` |
| Active plan | `docs/exec-plans/active/` |
| Quality grades | `docs/QUALITY_SCORE.md` |
| Tech debt | `docs/exec-plans/tech-debt-tracker.md` |
| Engineering beliefs | `docs/design-docs/core-beliefs.md` |

---

## Staleness Detection

If a skill's `Verified:` date is > 60 days old:
1. Fetch current docs via `ctx7` (resolve the library, fetch docs for the specific version)
2. If ctx7 unavailable, fallback to web search: `{library-name} {version} release notes migration breaking changes`
3. Apply any breaking changes to the scaffolded code before writing files
4. Update the `Verified:` date in the skill file after confirming alignment
