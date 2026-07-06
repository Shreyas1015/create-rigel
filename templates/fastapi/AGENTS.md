# AGENTS.md — Navigation Map

Stack: Python 3.14 · FastAPI 0.115 · SQLAlchemy 2 (async) · PostgreSQL · Redis · Celery · uv

---

## 🗺️ Where Everything Lives

| What you need | Where |
|---|---|
| Daily-driver commands | `Makefile` (`make bootstrap/dev/lint/test/gate/migrate/openapi`) |
| Runnable gate (same checks as gate-checker) | `scripts/gate.sh` (`make gate`) |
| Layer rules + dependency diagram | `ARCHITECTURE.md` |
| Engineering constitution (the WHY) | `docs/design-docs/core-beliefs.md` |
| Active execution plan | `docs/exec-plans/active/` |
| Completed plans (history) | `docs/exec-plans/completed/` |
| Product roadmap (epics → specs, dependency order) | `docs/product-specs/ROADMAP.md` |
| Product specs (draft) | `docs/product-specs/draft/` |
| Product specs (approved) | `docs/product-specs/ready/` |
| Architectural decisions (ADRs) | `docs/design-docs/decisions/` |
| Known tech debt | `docs/exec-plans/tech-debt-tracker.md` |
| Domain health grades | `docs/QUALITY_SCORE.md` |
| Plan format + lifecycle | `docs/PLANS.md` |
| Generated DB schema | `docs/generated/db-schema.md` |

---

## ⚡ Slash Commands

| Command | What it does |
|---|---|
| `/infra-setup` | Phase 0 — full infra scaffold (run once) |
| `/write-roadmap` | Turn a product brief into an ordered spec roadmap → `docs/product-specs/ROADMAP.md` |
| `/write-spec` | Write a product spec → `docs/product-specs/draft/` |
| `/write-plan` | Turn a READY spec into an execution plan |
| `/build-layer` | Build next unchecked layer from active plan + run gate |
| `/validate-layer` | Run gate check on current layer without building |
| `/push-layer` | Commit + push current layer with conventional message |
| `/layer-check` | Ad-hoc architecture violation scan |
| `/garbage-collect` | End-of-feature cleanup pass |
| `/doc-garden` | Scan + fix stale documentation |
| `/db-optimize` | EXPLAIN ANALYZE workflow for slow queries |
| `/load-test` | Run k6 smoke / stress / soak test |

---

## 🤖 Agents

| Agent | When to use |
|---|---|
| `gate-checker` | Called automatically by `/build-layer` — PASS/FAIL per layer |
| `reviewer` | Before opening a PR — full harness review |
| `arch-validator` | Deep import + layer compliance scan |
| `db-optimizer` | N+1, missing index, pagination audit on repo layer |
| `security-auditor` | OWASP Top 10 review — run before any auth/payment PR |
| `doc-gardener` | Use the `/doc-garden` skill |
| `garbage-collector` | Use the `/garbage-collect` skill |

---

## ✅ Non-Negotiable Invariants

- No `print()` → use `logger` from `src/providers/logger.py`
- No `os.environ` outside `src/config/settings.py`
- No raw dict cast on SQLAlchemy results → `Model.model_validate(row.__dict__)` only
- No file > 400 lines → split into focused modules
- No cross-layer imports → enforced by `ruff` + structural tests
- Every DB query result → `PydanticSchema.model_validate()`
- Every list endpoint → cursor-based pagination
- Every protected route → `Depends(require_auth)` as first dependency
- Every external call → `tenacity` retry + timeout
- All tests pass before `/push-layer`
- `raise HTTPException` only in runtime layer — never in service layer

---

## 🔁 The Flow

```
# Whole product (run once at the start):
/write-roadmap  →  human reviews ROADMAP  →  pick the walking-skeleton spec

# Every feature (repeat down the roadmap):
/write-spec (roadmap-guided)  →  human marks READY  →  /write-plan
  →  /build-layer (repeats, gate-enforced)
  →  /garbage-collect  →  plan closed
```
