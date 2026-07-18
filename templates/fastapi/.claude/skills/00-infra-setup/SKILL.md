# /infra-setup — Phase 0 Infrastructure Setup

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** FastAPI 0.115, SQLAlchemy 2.0, PyJWT 2.9, pwdlib 0.2, pytest 8, ruff 0.8, mypy 1.13, uv 0.4  
**Sources:** [FastAPI](https://fastapi.tiangolo.com/), [PyJWT](https://pypi.org/project/PyJWT/), [pwdlib](https://pypi.org/project/pwdlib/), [SQLAlchemy](https://www.sqlalchemy.org/), [uv](https://docs.astral.sh/uv/)

Triggered by: `/infra-setup`
Run ONCE when starting a new project. Check `pyproject.toml` exists first — if yes, abort.

---

## Step 1 — Python + uv Init
```bash
uv init --python 3.14
echo "3.14" > .python-version
```

Create `pyproject.toml` with all dependencies:

```toml
[project]
name = "your-service-name"
version = "0.0.1"
requires-python = ">=3.14"

# PEP 621: dependencies is an ARRAY of PEP 508 strings (NOT a Poetry-style table).
# Extras go in brackets: "uvicorn[standard]>=0.32". `uv sync` rejects the table form.
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "sqlalchemy[asyncio]>=2.0",
  "alembic>=1.14",
  "asyncpg>=0.30",
  "pydantic>=2.0",
  "pydantic-settings>=2.0",
  "email-validator>=2.0",
  "PyJWT[crypto]>=2.9",
  "pwdlib[argon2]>=0.2",
  "argon2-cffi>=23.0",
  "python-multipart>=0.0.9",
  "celery[redis]>=5.0",
  "redis>=5.0",
  "httpx>=0.28",
  "tenacity>=9.0",
  "structlog>=24.0",
  "opentelemetry-sdk>=1.0",
  "opentelemetry-instrumentation-fastapi>=0.49",
  "opentelemetry-instrumentation-sqlalchemy>=0.49",
  "opentelemetry-exporter-otlp>=1.0",
  "prometheus-fastapi-instrumentator>=7.0",
  "slowapi>=0.1",
  "limits>=3.0",
  "uuid-utils>=0.9",
]

# Dev tooling — PEP 735 dependency group (installed by `uv sync` by default).
[dependency-groups]
dev = [
  "pytest>=8.0",
  "pytest-asyncio>=0.24",
  "pytest-cov>=6.0",
  "factory-boy>=3.0",
  "faker>=30.0",
  "hypothesis>=6.0",            # property-based tests
  "schemathesis>=3.19,<4",      # OpenAPI contract/fuzz tests (v4 moved the from_asgi loader; pin <4)
  "mutmut>=3.0",                # mutation testing (run on critical service modules)
  "ruff>=0.8",
  "bandit>=1.7",               # full security scan in CI (ruff `S` is a fast subset for pre-commit)
  "mypy>=1.13",
  "pre-commit>=4.0",
  "sqlalchemy[mypy]>=2.0",
]

# Application (not a library) — don't try to build/install the project itself.
[tool.uv]
package = false

[tool.ruff]
line-length = 100
target-version = "py314"

[tool.ruff.lint]
# `S` = flake8-bandit fast subset (pre-commit); full `bandit -ll` runs in CI (see dev-deps).
select = ["E", "F", "I", "T20", "ANN", "S", "UP"]
# ANN101/ANN102 were REMOVED from ruff (>=0.2) — do not re-add. S101 = allow assert.
# UP046/UP047 (PEP 695 generic rewrites) are OFF: `class X(BaseModel, Generic[T])` and
# `def f(x: T)` stay valid — pydantic supports both styles and the docs use Generic[T].
# (PEP 695 `class X[T]` is allowed too; it just isn't forced.)
ignore = ["S101", "UP046", "UP047"]

[tool.ruff.lint.per-file-ignores]
"tests/**" = ["ANN", "S"]
"src/config/settings.py" = ["S105"]

[tool.mypy]
python_version = "3.14"
strict = true
ignore_missing_imports = true
plugins = ["pydantic.mypy", "sqlalchemy.ext.mypy.plugin"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
# REQUIRED: the app is `package = false` (not installed), so `from src... import` in
# tests raises ModuleNotFoundError without this. (Verified by dogfood: collection failed.)
pythonpath = ["."]
# Do NOT put --cov here: a global addopts coverage gate makes EVERY partial run fail
# (e.g. `pytest tests/architecture/` → 0% coverage → fail). Coverage is invoked
# explicitly — per-layer by the gate-checker, aggregate in CI. (Verified by dogfood:
# `pytest tests/architecture/` failed only on the coverage gate, not the tests.)
addopts = "-ra -q"

[tool.coverage.run]
source = ["src"]
omit = ["src/runtime/main.py", "src/providers/telemetry.py"]

[tool.coverage.report]
# Global floor = lowest per-layer threshold (providers 70). Per-layer thresholds
# (utils 100 / services 90 / repo 80 / runtime 75 / providers 70) are enforced by the
# gate-checker agent. Keep this ≤ the lowest per-layer floor so a full `pytest` run does
# not fail spuriously when a low-threshold layer drags the aggregate down.
fail_under = 70

[tool.mutmut]
# AC-7 mutation audit — a NIGHTLY ALARM, never a merge gate (.github/workflows/
# mutation-nightly.yml). mutmut mutates src/ and checks whether the acceptance-test
# holdout (tests/acceptance/) catches the mutants; scripts/mutation_report.py scores the
# JUnit output against a 60% floor. It judges tests/acceptance/ ONLY.
paths_to_mutate = "src/"
tests_dir = "tests/acceptance/"
```

## Step 2 — Install Dependencies
```bash
uv sync
```

## Step 3 — Directory Structure
```bash
mkdir -p \
  src/{types,config,models,repo,services,utils} \
  src/runtime/{routers/v1,workers,exception_handlers} \
  src/providers/auth \
  tests/{architecture,unit/{services,repo,utils},integration,contract,load} \
  alembic/versions \
  docs/{product-specs/{draft,ready},exec-plans/{active,completed},design-docs/decisions,generated} \
  infra/monitoring \
  .github/workflows
```

## Step 4 — Environment Setup
Create `.env.example`:
```
APP_ENV=development
PORT=8000
DATABASE_URL=postgresql+asyncpg://app:app@localhost:5432/app
DATABASE_POOL_SIZE=10
DATABASE_POOL_MIN=2
REDIS_URL=redis://localhost:6379
JWT_SECRET=
JWT_ACCESS_EXPIRY_SECONDS=900
JWT_REFRESH_EXPIRY_SECONDS=604800
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=INFO
SERVICE_NAME=your-service-name
APP_VERSION=0.0.1
OTEL_EXPORTER_OTLP_ENDPOINT=
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

Create `src/config/settings.py` — pydantic-settings BaseSettings, `process.exit` equivalent on failure.
Create `src/config/constants.py` — app-wide constants.
Create `src/config/timeouts.py` — `DB_QUERY_MS=5000`, `EXTERNAL_API_MS=10000`.

## Step 5 — Providers
Create `src/providers/logger.py` — structlog JSON renderer with redaction.
Create `src/providers/database.py` — async SQLAlchemy engine + session factory + `get_session` Depends.
Create `src/providers/redis_client.py` — redis-py async client singleton.
Create `src/providers/telemetry.py` — OTel SDK init.
Create `src/providers/auth/jwt.py` — PyJWT sign/verify/decode with RS256 support.
Create `src/providers/auth/password.py` — pwdlib PasswordHash for argon2id hashing.
Create `src/providers/auth/middleware.py` — `require_auth` Depends, `AuthContext`.
  - The `Authorization` header MUST be OPTIONAL in the signature (`Header(default=None)`); raise `AuthError` (→401) when missing/invalid. A required `Header(...)` makes FastAPI return **422 + a non-enveloped body** for the common no-token case — wrong status AND breaks the envelope contract. (Verified by dogfood: required Header → 422.)
Create `src/providers/rate_limit.py` — slowapi limiter with Redis store (3 tiers).

## Step 6 — Runtime Base
Create `src/runtime/exception_handlers.py` — maps DomainError subclasses → HTTPException, emits ErrorEnvelope.
  - ALSO register a `RequestValidationError` handler that returns an **enveloped** 422 (`{ok:false, error:{code:"VALIDATION_ERROR",...}, meta}`). Without it, every 422 returns FastAPI's default `{detail:[...]}`, violating "envelope always".
Create `src/runtime/middleware.py` — SecurityHeadersMiddleware (7 headers), request ID.
Create `src/runtime/routers/v1/health.py` — `/v1/health` + `/v1/ready`.
Create `src/runtime/main.py` — FastAPI app, all middleware, all routers, lifespan handler.
Create `src/runtime/response_util.py` — `ok()`, `err()` builders (import envelope types from `src.types.common`).
  - MUST live in `runtime/`, NOT `utils/` — `utils` may not import domain types, and `ok()` returns `SuccessEnvelope`. Putting it in utils fails `tests/architecture/test_layers.py::test_utils_has_no_domain_imports`. (Verified by dogfood: it fails.)
Create `src/utils/cursor_util.py` — base64url encode/decode for opaque cursor pagination.
  - `decode_cursor` MUST catch malformed input (`binascii.Error`, `json.JSONDecodeError`, `ValueError`, `UnicodeDecodeError`) and raise `InvalidCursorError` (→400) — NEVER let a bad `?cursor=` value 500. (Verified by dogfood: schemathesis crashed the list endpoint with `?cursor=null`.)
Create `src/utils/audit_log_util.py` — audit log writer (who, what, resource, timestamp).
Create `src/utils/gdpr_delete_util.py` — cascade GDPR deletion (anonymize PII, hard-delete sensitive, keep audit).
Create `src/utils/uuid_util.py` — `new_id()` → uuid7 (use `uuid_utils.compat.uuid7` → returns stdlib `uuid.UUID`).
Create `src/utils/retry_util.py` — tenacity retry decorator + timeout wrapper.
Create `src/types/exceptions.py` — `DomainError` base + subclasses: `NotFoundError` (404), `AuthError` (401), `InvalidCursorError` (400), `ValidationDomainError` (422).
Create `src/types/common.py` — `PageResult[T]`, `AuthContext`, `Meta`, `SuccessEnvelope[T]`, `ErrorEnvelope`.

## Step 7 — Alembic
```bash
uv run alembic init alembic
```
Update `alembic/env.py` to use async engine + read `DATABASE_URL` from settings.
Update `alembic.ini` to read URL from settings.

## Step 8 — Testing Base
Create `tests/conftest.py` — async session fixture (auto-rollback), async_client, auth_client, loginAs helper.
Create `tests/architecture/test_layers.py` — ast-based import graph structural tests.

> **Deterministic-eval arch tests ship with the template** — do NOT recreate or overwrite them:
> `tests/architecture/test_traceability.py` (AC-1/AC-4 static: every spec AC-N has a
> red-recorded acceptance test) and `tests/architecture/test_assertion_integrity.py` (AC-5:
> AC-claiming tests have a non-trivial assertion). They are self-contained (pure stdlib),
> skip cleanly on a fresh repo, and run in the gate automatically via `scripts/gate.sh`'s
> `pytest tests/architecture/`. The holdout dir `tests/acceptance/` (one dir per spec,
> `SPEC-XXX/`) also ships; its contents are scaffolded by `/write-spec`, not here.
Create `tests/integration/test_cross_user_isolation.py` — User A creates resource, User B attempts access (404 not 403).
Create `tests/integration/test_gdpr_deletion.py` — cascade deletion test (PII anonymized, audit kept).
Create `tests/contract/test_openapi.py` — schemathesis: load `/openapi.json`, fuzz every endpoint (`schemathesis.from_asgi`).
  - FastAPI 0.115 emits **OpenAPI 3.1**, which schemathesis 3.x only supports experimentally. Enable it in-code: `schemathesis.experimental.OPEN_API_3_1.enable()` (or pass `--experimental=openapi-3.1` to the CLI). Without it: "Open API 3.1.0 ... not fully supported". (Verified by dogfood.)
  - This catches real bugs: fuzzing `?cursor=` with garbage MUST return 400 (`InvalidCursorError`), never 500. (Dogfood found exactly this 500.)
Create `tests/load/smoke.js` — k6 smoke test scaffold (1 VU, 30s).
Create `tests/load/stress.js` — k6 stress test (ramping VUs, P95/P99 thresholds).

## Step 9 — Makefile + gate script (single-command DX)
Create `Makefile` with daily-driver targets — every doc command goes through these:
```make
.PHONY: bootstrap dev lint format typecheck test gate gate-final redgreen ac-vector migrate openapi up down
bootstrap: ; uv sync && uv run pre-commit install      # one-command setup
dev:       ; uv run uvicorn src.runtime.main:app --reload
lint:      ; uv run ruff check src/ tests/
format:    ; uv run ruff format src/ tests/
typecheck: ; uv run mypy src/
test:      ; uv run pytest
gate:      ; bash scripts/gate.sh                       # deterministic, same checks as gate-checker agent
redgreen:  ; uv run python scripts/redgreen_record.py $(SPEC)   # AC-4: prove acceptance tests red (make redgreen SPEC=SPEC-XXX)
ac-vector: ; uv run python scripts/ac_vector.py         # AC-1: feature-completion pass/fail vector (non-zero unless all PASS)
gate-final: gate ac-vector                              # per-layer gate + the green AC vector (feature done)
migrate:   ; uv run alembic upgrade head
openapi:   ; set -a; [ -f .env ] && . ./.env; set +a; uv run python -c "import json,sys; from src.runtime.main import app; json.dump(app.openapi(), sys.stdout)" > openapi.json
up:        ; docker compose up -d
down:      ; docker compose down
```
Create `scripts/gate.sh` — runnable mirror of the gate-checker checks (file-size, print, os.environ, ruff, mypy, bandit, architecture tests, coverage). Exits non-zero on any failure so pre-commit and humans can run the SAME gate the agent runs.

## Step 10 — Docker
Create `Dockerfile` — multi-stage (deps → runner), non-root user, HEALTHCHECK.
Create `.dockerignore` — exclude `.git`, `.venv`, `__pycache__`, `.env*`, `tests/`, `docs/`, `*.md`, `.github/` (prevents secret leaks + bloated build context).
Create `docker-compose.yml` — app + postgres:16 + redis:7 + pgbouncer (commented out).
Create `infra/monitoring/docker-compose.lgtm.yml` — local LGTM stack (Grafana + Loki + Tempo + Prometheus) wired to the app's OTLP endpoint, so "observability is not optional" is true locally too.

## Step 11 — GitHub Actions + supply chain
Create `.github/workflows/ci.yml` with INDEPENDENT parallel jobs (security must not be gated behind lint):
- `quality`: ruff check + ruff format --check + mypy
- `test`: `pytest --cov=src --cov-report=term-missing --cov-fail-under=70` (coverage is explicit here — NOT in addopts) + schemathesis contract tests (`--experimental=openapi-3.1`)
- `security`: bandit -ll + pip-audit + gitleaks (secret scan) — runs even if `quality` fails
- `image`: build Dockerfile → Trivy scan (fail on HIGH/CRITICAL) → generate SBOM (Syft, CycloneDX) → upload artifact
Use `actions/cache` / `astral-sh/setup-uv` cache. Pin action SHAs.
Create `.github/workflows/load-test.yml` — k6 smoke on PR against ephemeral env + on staging deploy (P95/error budgets fail the job, not just report).
Create `.github/dependabot.yml` — weekly `uv`/pip + GitHub Actions + Docker update PRs.
Create `.gitleaks.toml` and add `gitleaks` + `trivy` notes; wire gitleaks as a pre-commit hook too (Step 12).

## Step 12 — ruff + git hooks
Create `ruff.toml` (or in pyproject.toml — already done in Step 1).
Create `.pre-commit-config.yaml` — ruff-pre-commit + mypy + gitleaks + `bash scripts/gate.sh` (so the gate runs locally before every commit).

Activate the git hooks. They ship committed under `.githooks/` (toolchain-free POSIX shell that
reads `.rigel/git-policy.json`); the stack-specific `.githooks/pre-commit` reuses the
`.pre-commit-config.yaml` toolchain via `pre-commit run`. Point git at `.githooks` **instead of**
running `pre-commit install`, so the identical `commit-msg`/`pre-push` policy hooks and this
stack's `pre-commit` all live in one place:
```bash
git config core.hooksPath .githooks
chmod +x .githooks/*
```

This turns on three hooks:
- `commit-msg` — rejects non-Conventional-Commit messages (identical across every template).
- `pre-push` — rejects a branch name that violates `.rigel/git-policy.json` (identical across templates).
- `pre-commit` — runs `.pre-commit-config.yaml` (ruff + mypy + gitleaks + gate) on staged files.

Branch protection is applied once, after the GitHub repo exists — see `docs/git-workflow.md`
and `scripts/protect-branch.sh`. CI (`.github/workflows/git-policy.yml`, ships with the template)
enforces branch name, Conventional Commits, the PLAN reference, and protection drift on every PR.

## Step 13 — Scaffold Docs
Write `ADR-000-infrastructure.md` with today's date. Include sections:
- **Auth Libraries**: PyJWT (JWT), pwdlib (password hashing)
  - Reasoning: python-jose abandoned (last commit 2023, CVEs), passlib broken on Python 3.13+
  - PyJWT: FastAPI official recommendation, actively maintained
  - pwdlib: created by FastAPI Users maintainer, Python 3.13+ compatible
  - Alternatives considered: python-jose (rejected: abandoned), passlib (rejected: broken), bcrypt directly (rejected: argon2id is OWASP recommended)
- **Task Queue**: Celery vs arq evaluation
  - Celery: sync-first, beat scheduling, chord/chain primitives, larger ecosystem
  - arq: async-native (by Pydantic team), Redis-backed, type-safe, simpler API
  - Current choice: Celery (mature, feature-complete)
  - Trade-off: async tasks require asyncio.run() wrapper in Celery
  - Revisit: if beat scheduling or chord/chain not needed, consider arq for async-first simplicity
- **OpenAPI → Frontend Sync**: GET /openapi.json feeds frontend /api-sync command
  - Workflow: run backend → copy /openapi.json → run /api-sync in frontend repo
- **Version Bounds**: `>=` strategy for all dependencies (no pinning)
  - Lock file (uv.lock) pins transitive deps automatically
  - Upper bounds cause dependency hell in libraries
  - Security updates apply immediately via `uv sync --upgrade`

Write `docs/design-docs/index.md`, `decisions/index.md`.
Write `docs/product-specs/index.md`.
Write `docs/exec-plans/tech-debt-tracker.md`.

## Gate Check
```bash
make gate     # deterministic — runs the same checks as the gate-checker agent
# (equivalently:)
uv run ruff check src/
uv run bandit -r src/ -ll
uv run mypy src/
uv run pytest tests/architecture/ -v
```

## Commit
```bash
git add -A
git commit -m "chore(infra): phase 0 infrastructure setup

- FastAPI 0.115 + Python 3.14 + SQLAlchemy 2 (async)
- pydantic-settings validated config
- structlog JSON logging with redaction
- OpenTelemetry + prometheus-fastapi-instrumentator
- Celery + Redis queue
- slowapi rate limiting (Redis store)
- Health checks: /v1/health + /v1/ready
- Alembic migrations configured
- Dockerfile multi-stage, non-root user + .dockerignore
- docker-compose: app + postgres:16 + redis:7; local LGTM observability stack
- Makefile (bootstrap/dev/lint/test/gate/migrate/openapi) + scripts/gate.sh
- CI: parallel quality/test/security/image jobs (ruff, mypy, pytest, schemathesis, bandit, pip-audit, gitleaks, Trivy, SBOM)
- Dependabot (uv + actions + docker)
- Architecture structural tests (AST-based)
- ADR-000: infrastructure decisions"
git push origin main
```
