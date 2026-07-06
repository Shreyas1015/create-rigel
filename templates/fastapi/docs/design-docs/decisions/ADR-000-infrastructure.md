# ADR-000 — Infrastructure & Stack Choices

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** Phase 0

---

## Context
Starting a new Python backend project. Stack choices made here are expensive to change.

---

## Decisions

### Runtime: Python 3.14 + FastAPI 0.115
- Python 3.14 is the latest stable (released Oct 2025) — improved performance, better typing
- FastAPI: async-native, auto OpenAPI, Pydantic v2 integration, best-in-class DX
- Alternatives rejected: Flask (no async-native), Django (too opinionated for API-only)

### ORM: SQLAlchemy 2 (async) + Alembic
- SQLAlchemy 2 has proper async support (not bolted on)
- `asyncpg` driver — fastest async PostgreSQL driver available
- Alembic is SQLAlchemy's own migration tool — tight integration
- Alternatives rejected: Tortoise ORM (less mature), SQLModel (thin wrapper, less control)

### Validation: Pydantic v2
- FastAPI's native schema layer — zero friction integration
- v2 is 5-17x faster than v1 (Rust core)
- Used at every external data boundary via `model_validate()`

### Auth: PyJWT[crypto] + pwdlib[argon2]
- PyJWT: FastAPI's official recommendation, actively maintained, RS256/HS256 support
- pwdlib (`PasswordHash.recommended()` → argon2id): created by the FastAPI Users maintainer, Python 3.13+ compatible
- argon2id: OWASP-recommended, winner of the Password Hashing Competition — GPU-resistant
- Alternatives rejected:
  - python-jose (abandoned — last release 2023, open CVEs)
  - passlib (BROKEN on Python 3.13+ — `crypt` module removed in 3.13)
  - bcrypt directly (GPU-vulnerable vs argon2id)

### Queue: Celery 5 + Redis
- Most mature Python task queue — battle-tested at scale
- Redis broker: same Redis instance used for caching and rate limiting
- Alternatives considered: dramatiq (simpler but less ecosystem), RQ (less features)

### Logging: structlog 24
- Structured JSON logging — equivalent of pino for Python
- Built-in context binding, redaction, async support
- Alternatives rejected: loguru (less structured), standard logging (no structured output)

### Rate Limiting: slowapi + limits (Redis store)
- slowapi: FastAPI-native rate limiting via Depends()
- Redis store: distributed — works across multiple uvicorn workers
- Alternatives: custom middleware (more work, same result)

### Package Manager: uv
- 10-100x faster than pip
- Manages Python version + virtualenv + dependencies in one tool
- Replaces: pip, pip-tools, pyenv, virtualenv
- Lockfile (`uv.lock`) committed for reproducible installs

### Linter/Formatter: ruff
- Replaces: flake8 + black + isort + pyupgrade in one tool
- Written in Rust — 10-100x faster than alternatives
- Single config in `pyproject.toml`

### PgBouncer
- NOT in application code — infrastructure concern
- Uncomment in `docker-compose.yml` when concurrent users > 50
- App connects to PgBouncer (port 6432), PgBouncer connects to PostgreSQL

---

## Consequences
- FastAPI async: all DB calls must be `await session.execute(...)` — no sync ORM calls
- SQLAlchemy async: sessions are NOT thread-safe — inject via `Depends(get_session)`, never share
- Celery: sync tasks (Celery is sync by default) — use `asyncio.run()` inside tasks for async calls
- PyJWT: stateless tokens — revocation requires a Redis denylist check on every verify
- argon2id (pwdlib): intentionally slow — login endpoint will be slower than bcrypt (~200ms vs ~100ms)
