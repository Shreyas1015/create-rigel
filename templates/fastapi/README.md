# FastAPI Agent Template

Production-ready FastAPI template with layered architecture, SQLAlchemy 2 async, OpenTelemetry, and full agent harness for spec → plan → build → test → deploy workflow.

---

## Quick Start

```bash
# Initialize new project
/infra-setup

# Plan a whole product (run before /write-spec)
/write-roadmap # → docs/product-specs/ROADMAP.md (brief → ordered, dependency-aware specs)

# Build a feature
/write-spec    # → docs/product-specs/draft/ (roadmap-guided)
/write-plan    # → docs/exec-plans/active/
/build-layer   # → auto-build + gate + commit + push (one layer at a time)

# Quality gates
/validate-layer    # Run gate without building
/layer-check       # Ad-hoc architecture violation scan
/db-optimize       # N+1 query detection, missing indexes
/load-test smoke   # k6 performance test
```

---

## Stack

| Category | Packages |
|---|---|
| **Runtime** | Python 3.14, FastAPI 0.115, uvicorn[standard] 0.32 |
| **ORM** | SQLAlchemy 2 (async), Alembic, asyncpg |
| **Auth** | PyJWT[crypto] 2.9, pwdlib[argon2] 0.2, argon2-cffi |
| **Queue** | Celery 5, Redis 5 |
| **Logging** | structlog 24 |
| **Tracing** | opentelemetry-sdk, opentelemetry-instrumentation-fastapi, prometheus-fastapi-instrumentator |
| **Validation** | pydantic 2, pydantic-settings 2, email-validator |
| **HTTP Client** | httpx, tenacity |
| **Rate Limit** | slowapi, limits (Redis store) |
| **Testing** | pytest 8, pytest-asyncio, pytest-cov, httpx AsyncClient, factory-boy, faker |
| **Security** | bandit |
| **Tooling** | uv, ruff, mypy, pre-commit |

---

## ✅ Key Features

- **Layered architecture** enforced by ruff + AST structural tests
- **Pydantic v2 validation** at every DB boundary (`model_validate` required)
- **Structured JSON logging** with PII redaction (structlog)
- **OpenTelemetry** instrumentation (FastAPI + SQLAlchemy)
- **Rate limiting** with Redis store (3 tiers: auth, public, user)
- **Cursor pagination** with opaque base64url tokens (no leaking impl details)
- **Response envelopes** standardized: `{ ok, data, meta }` success, `{ ok: false, error, meta }` errors
- **Security headers** middleware (7 headers: CSP, HSTS, X-Frame-Options, etc.)
- **GDPR deletion** utility (anonymize PII, hard-delete sensitive, keep audit)
- **Audit logging** utility (who, what, resource, timestamp)
- **Cross-user isolation** tests (404 not 403 — don't leak resource existence)
- **k6 load tests** (smoke + stress with P95/P99 budgets enforced in CI)
- **schemathesis** OpenAPI contract/fuzz tests against `/openapi.json`
- **Multi-stage Dockerfile** + `.dockerignore` (non-root user, HEALTHCHECK)
- **GitHub Actions CI** — parallel jobs: quality (ruff + mypy), test (pytest + schemathesis), security (bandit + pip-audit + gitleaks), image (Trivy scan + SBOM)
- **Dependabot** (uv + GitHub Actions + Docker)
- **Makefile** single-command DX (`make bootstrap/dev/lint/test/gate/migrate/openapi`) + runnable `scripts/gate.sh`
- **Agent-first workflow** (spec → plan → build loop with auto-gating)

---

## Why `>=` Version Bounds?

All dependencies use `>=` (no upper bounds):

```toml
fastapi = ">=0.115"
pydantic = ">=2.0"
```

**Reasoning:**

- `uv.lock` pins exact versions for reproducible builds (lock file does the pinning)
- Upper bounds cause **dependency hell** in libraries (if lib A pins `pydantic<3` and lib B pins `pydantic<2.5`, they're incompatible)
- Security updates apply immediately via `uv sync --upgrade` (no waiting for maintainer to bump upper bound)
- Dependabot raises weekly PRs that bump `uv.lock` and re-run the full CI gate, so updates are reviewed, not blind
- Lockfile-first dependency management (pin the lock, range the manifest) is standard modern practice

This is the same strategy as Rust (Cargo.toml) and modern Python packaging (PEP 440 discourages upper bounds).

---

## Architecture Layers

```
src/
├── types/         # Domain exceptions, common types (no imports allowed)
├── config/        # Settings, constants, timeouts (pydantic-settings)
├── models/        # SQLAlchemy models (ORM only)
├── repo/          # DB queries, cursor pagination, ownership filters
├── services/      # Business logic (raise DomainError, never HTTPException)
├── utils/         # Pure functions (no domain imports)
├── providers/     # External integrations (DB, Redis, auth, logger, telemetry)
└── runtime/       # FastAPI routers, middleware, exception handlers
```

**Enforced by:**

- ruff import rules
- `tests/architecture/test_layers.py` (AST-based structural tests)
- post-write hook (catches `print()`, `os.environ`, HTTPException in services)

---

## Project Files

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Layer rules + dependency graph |
| `AGENTS.md` | Navigation map for agents (which files do what) |
| `.claude/CLAUDE.md` | Agent entry point (read first on every session) |
| `.claude/rules/*.md` | Path-scoped rules (auto-injected based on file being edited) |
| `.claude/skills/*.md` | Slash commands (`/infra-setup`, `/build-layer`, etc.) |
| `docs/product-specs/ROADMAP.md` | Whole-product spec roadmap (epics, dependency order, walking skeleton) |
| `docs/exec-plans/active/` | Current execution plan (checked boxes = done) |
| `docs/design-docs/decisions/` | ADRs (Architecture Decision Records) |
| `docs/product-specs/ready/` | Approved specs ready for implementation |

---

## OpenAPI → Frontend Sync

FastAPI auto-generates OpenAPI spec at `GET /openapi.json`. To sync with frontend:

```bash
# 1. Export the OpenAPI spec (no running server needed)
make openapi          # → openapi.json  (app.openapi() dumped to file)

# 2. In frontend repo
/api-sync             # generates TypeScript types from openapi.json
```

This keeps frontend types in sync with backend contract.

---

## Celery vs arq

Template uses **Celery 5** by default. Trade-offs:

| Feature | Celery | arq |
|---|---|---|
| **Async support** | Sync-first (requires `asyncio.run()` wrapper) | Native async |
| **Scheduling** | Beat (cron-like) | None (use external scheduler) |
| **Workflows** | Chain, chord, group primitives | Manual composition |
| **Ecosystem** | Large (flower, django-celery, etc.) | Small (Pydantic team only) |
| **Type safety** | Manual | Built-in (Pydantic v2) |

**When to use arq:** If you don't need beat scheduling or chord/chain and want native async + type safety, consider arq.

**Decision documented in:** `docs/design-docs/decisions/ADR-000-infrastructure.md` (scaffolded by `/infra-setup`)

---

## License

MIT (or your org's standard license)

---

## Contributing

This is a template repository. To update:

1. Edit `.claude/skills/*.md` (skill scaffolds)
2. Edit `.claude/rules/*.md` (path-scoped rules)
3. Edit `CLAUDE.md`, `ARCHITECTURE.md`, `AGENTS.md` (agent context)
4. Update `Verified:` headers on skills when libraries change
5. Run staleness detection: if `Verified:` date > 60 days, fetch current docs via `ctx7`
