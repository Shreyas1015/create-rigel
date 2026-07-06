# ARCHITECTURE.md — Layered Architecture

Stack: Python 3.14 · FastAPI 0.115 · SQLAlchemy 2 (async) · Alembic · PostgreSQL · Redis · Celery

---

## Dependency Layer Diagram

```
┌──────────────────────────────────────────────────────────┐
│  Utils  — stateless helpers, zero domain imports         │
│           100% test coverage required                     │
└───────────────────────┬──────────────────────────────────┘
                        │ (imported by all layers below)
┌───────────────────────▼──────────────────────────────────┐
│                                                           │
│  Types ──► Config ──► Models ──► Repo                    │
│                                    │                      │
│                                    ▼                      │
│                                 Service                   │
│                                    │                      │
│                                    ▼                      │
│                    Runtime { Routers · Workers }          │
│                                                           │
│  Providers (auth, logger, db session, redis, telemetry)  │
│  └─ enter domain via FastAPI Depends() only              │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## Layer Definitions

### Types (`src/types/`)
- Pure Pydantic `BaseModel` schemas, enums, TypedDicts
- **Zero imports** from other layers
- **Zero logic** — only field definitions and validators
- Examples: `ApplicationStage`, `CreateApplicationInput`, `PageResult[T]`

### Config (`src/config/`)
- `pydantic-settings` `BaseSettings` — typed, validated on startup
- Imports: **Types only**
- `settings.py` raises `ValidationError` on bad env → process never starts
- Examples: `settings.py`, `constants.py`, `timeouts.py`

### Models (`src/models/`)
- SQLAlchemy 2 ORM model classes — schema only, no logic
- Imports: **Types, Config**
- All models: `__mapper_args__` soft delete pattern, `uuid7()` default on id
- Indexes defined in model `__table_args__`
- Examples: `user.py`, `application.py`

### Repo (`src/repo/`)
- Async DB access **and** outbound external-API gateways (`*_gateway.py`, httpx + tenacity). All output validated with Pydantic.
- This is the home for "external APIs go via Repo" — services never make inline HTTP calls.
- Imports: **Types, Config, Models**
- **Every** query/response result: `Schema.model_validate(row.__dict__)`
- All list methods: cursor-based pagination (`WHERE created_at < :cursor`)
- Ownership enforced: `WHERE id = :id AND user_id = :user_id`
- Examples: `user_repo.py`, `application_repo.py`

### Service (`src/services/`)
- Business logic and use-case orchestration
- Imports: **Types, Config, Repo**
- **No** `Request`, `HTTPException`, `fastapi` imports
- **No** inline HTTP calls — external APIs go via Repo
- `raise DomainError(...)` — never `raise HTTPException`
- Examples: `application_service.py`, `auth_service.py`

### Runtime (`src/runtime/`)
- FastAPI routers, Celery workers, CLI entry points
- Imports: **Types, Config, Repo, Service**
- Routes: `Depends(require_auth)` first, then validate, then service, then respond
- Thin layer — zero business logic
- Maps `DomainError` → `HTTPException` in exception handlers
- Examples: `routers/v1/applications.py`, `workers/reminder_worker.py`

### Providers (`src/providers/`)
- Cross-cutting: logger, db session factory, redis, auth, telemetry
- Injected via FastAPI `Depends()` — never imported directly by Service
- Examples: `logger.py`, `database.py`, `auth/jwt.py`

### Utils (`src/utils/`)
- Stateless helpers — **zero domain imports**
- **100% test coverage** required
- Examples: `retry.py`, `pagination.py`, `uuid_util.py`

---

## Allowed Imports (strict — ruff enforces)

```
Types   →  (nothing)
Config  →  Types
Models  →  Types, Config
Repo    →  Types, Config, Models
Service →  Types, Config, Repo
Runtime →  Types, Config, Repo, Service
Utils   →  (nothing)
Providers → Types, Config only
```

**Forbidden:**
- Service importing `fastapi`, `HTTPException`, or anything from Runtime
- Repo containing business logic (if/else beyond null checks)
- Utils importing any domain layer
- Circular imports of any kind
- `os.environ` outside `src/config/settings.py`

---

## File Size Limit
- **400 lines maximum** per file
- Enforced by: PostToolUse hook + gate-checker agent

---

## Naming Conventions

| Layer | Pattern | Example |
|---|---|---|
| Types | `*_schema.py` or `*_types.py` | `application_schema.py` |
| Config | `settings.py`, `constants.py` | `settings.py` |
| Models | `*.py` in `models/` | `application.py` |
| Repo | `*_repo.py` | `application_repo.py` |
| Service | `*_service.py` | `application_service.py` |
| Router | `*.py` in `routers/v1/` | `applications.py` |
| Worker | `*_worker.py` | `reminder_worker.py` |
| Utils | `*_util.py` | `retry_util.py` |
| Pydantic schemas | `PascalCase` | `ApplicationResponse` |

---

## Mechanical Enforcement Stack

1. **ruff rules** — `no-os-environ`, `no-cross-layer-import`, `no-print`
2. **PostToolUse hooks** — fire on every file write (size, print, os.environ)
3. **Structural tests** — `tests/architecture/test_layers.py` — fails CI on violations
4. **gate-checker agent** — PASS required before every commit
5. **mypy** — strict type checking on every CI run
