# /build-layer — Build Next Layer from Active Plan

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** FastAPI 0.115, SQLAlchemy 2.0, pydantic 2, pytest 8 — see .claude/rules/*.md for layer specifics  

Triggered by: `/build-layer` (no argument — reads active plan automatically)

---

## Step 1 — Find Active Plan and Next Layer

```bash
PLAN=$(ls docs/exec-plans/active/*.md 2>/dev/null | head -1)
[[ -z "$PLAN" ]] && echo "No active plan. Run /write-plan first." && exit 1
cat "$PLAN"
```

Parse the Build Order table. Find first row with `[ ]`. If all `[x]` → run `/garbage-collect`.

---

## Step 2 — Load Context

Read: active plan, linked spec, `ARCHITECTURE.md`, and the path-scoped rule:

- Types → `.claude/rules/architecture.md`
- Config → `.claude/rules/architecture.md`
- Models → `.claude/rules/database.md`
- Repo → `.claude/rules/database.md` + `.claude/rules/security.md`
- Service → `.claude/rules/architecture.md` + `.claude/rules/security.md`
- Runtime → `.claude/rules/api.md` + `.claude/rules/security.md`
- Workers → `.claude/rules/jobs.md`
- Tests → `.claude/rules/testing.md`

---

## Step 3 — Build the Layer

### Types (`src/types/`)

- One file per domain entity: `{entity}_schema.py`
- Pydantic `BaseModel` — input schemas, response schemas, enums
- `exceptions.py` — `DomainError` subclasses: `ApplicationNotFoundError`, `StageTransitionError` etc.
- `common.py` — `PageResult[T]`, cursor types
- Zero imports from other src layers. Zero logic.

### Config (`src/config/`)

- Update `settings.py` if new env vars needed (add to `Settings` + `.env.example`)
- Add domain constants to `constants.py`

### Models (`src/models/`)

- One file per entity: `{entity}.py`
- SQLAlchemy 2 declarative `MappedColumn` style
- `deleted_at: Mapped[datetime | None] = mapped_column(default=None)`
- `id: Mapped[UUID] = mapped_column(default=uuid_utils.uuid7)`
- `__table_args__` with indexes (FK cols + ORDER BY cols + partial on deleted_at)
- Export all from `src/models/__init__.py`

### Migrations (`alembic/versions/`)

```bash
uv run alembic revision --autogenerate -m "create_{table}"
# Review generated file — fix any issues
uv run alembic upgrade head
# Verify it ran clean
```

### Repo (`src/repo/`)

- One file per entity: `{entity}_repo.py`
- Every result: `Schema.model_validate(row.__dict__)`
- List methods: cursor pagination (Op.lt on created_at + id)
- Ownership: `WHERE id = :id AND user_id = :user_id`
- No N+1: use `selectinload()` / `joinedload()` for related data
- Soft delete: `WHERE deleted_at IS NULL` on every query

### Service (`src/services/`)

- One file per domain: `{domain}_service.py`
- Receives: `AsyncSession` + typed Pydantic inputs
- Returns: typed Pydantic outputs
- Raises: `DomainError` subclasses — NEVER `HTTPException`
- NO `from fastapi import ...`
- State machines, business rules, orchestration live here
- Multi-table writes: `async with session.begin():`

### Runtime (`src/runtime/routers/v1/`)

- One file per resource: `{resource}.py`
- All routes: `Depends(require_auth)` as first dependency
- Handler body: service call only — no business logic
- Exception mapping: handled by global handlers in `exception_handlers.py`
- All under `/api/v1/` prefix

### Workers (`src/runtime/workers/`)

- One file per queue: `{name}_worker.py`
- First line: `data = PayloadSchema.model_validate(payload)`
- Log: start, complete, failed with structlog
- Re-raise on error (Celery handles retry per task config)

### Tests (`tests/`)

- `tests/unit/services/{service}_test.py` — service layer, mock repos
- `tests/unit/utils/{util}_test.py` — utils
- `tests/integration/test_{feature}.py` — full HTTP via AsyncClient
- Meet coverage thresholds from `.claude/rules/testing.md`

---

## Step 4 — Run Gate

Call `gate-checker` agent.

**If FAIL:**

- Read each ITEM → fix automatically → log fix
- Re-run gate (max 3 attempts), following the role-escalation rule below

### Gate escalation — role routing (see `.claude/model-routing.json`)

Track the gate FAIL count for THIS layer across re-runs:

- **Attempts 1–2** (same layer): run each fix-and-re-gate cycle with a **worker**-role subagent (`sonnet`).
- **Attempt 3** (same layer — i.e. 2 worker attempts have already failed the gate): **escalate**. Run the fix-and-re-gate cycle with an **orchestrator**-role subagent (`opus`), then append **one** structured lesson record to `docs/exec-plans/lessons.log` (create the file if absent), verbatim in this shape:

  ```
  PLAN-<id> layer=<layer> escalated to orchestrator after 2 worker attempts failed gate
  ```

  One line per escalation, kept greppable — this is the episodic input a later memory phase consumes; do not reshape it.
- If the escalated (orchestrator) attempt still fails → stop and present the exact blocker to the human.

**If PASS:**

- Tick checkbox in plan: `- [ ] Layer N` → `- [x] Layer N`
- Write ADR if non-obvious decision was made

---

## Step 5 — ADR (if needed)

Save to `docs/design-docs/decisions/ADR-XXX-{slug}.md`.
Update `docs/design-docs/decisions/index.md`.

---

## Step 6 — Commit and Push

```bash
git add -A
git commit -m "{feat|chore|test}({layer}): {description}

{bullet points}

PLAN-XXX Layer N/Total"
git push origin "$(git branch --show-current)"   # the feature branch — never main (protected)
```

---

## Step 7 — Report to Human

```
═══════════════════════════════════════════
✅ Layer N ({layer-name}) — COMPLETE
═══════════════════════════════════════════
Files created: [list]
Gate attempts: N
Auto-fixed:    [list of fixes]
ADR written:   ADR-XXX / None needed
Committed:     [hash]

Progress: [x] Layer 1  [x] Layer 2  [ ] Layer 3 ...

Ready for Layer N+1: {next-layer-name}
Confirm to continue? [human must respond]
═══════════════════════════════════════════
```

**Wait for human confirmation before next layer.**
