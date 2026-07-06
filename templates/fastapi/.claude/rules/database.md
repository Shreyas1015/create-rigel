---
paths:
  - "src/repo/**/*.py"
  - "src/models/**/*.py"
  - "alembic/versions/**/*.py"
---

# Database Rules — Auto-injected on repo/model/migration edits

## The 5 Checks Before Every Repo Method Ships

### 1. Pydantic Validation on Every Result
```python
# ✅ REQUIRED
row = result.scalar_one_or_none()
if not row:
    raise ApplicationNotFoundError(...)
return ApplicationResponse.model_validate(row.__dict__)

# ❌ FORBIDDEN
return row.__dict__          # raw, unvalidated
return dict(row.__dict__)    # cast, not validated
return row                   # ORM object leaking out of repo
```

### 2. No N+1 — Eager Load Always
```python
# ✅ selectinload for related collections
stmt = (
    select(Application)
    .where(Application.user_id == user_id)
    .options(
        selectinload(Application.notes),
        selectinload(Application.contacts),
    )
)

# ❌ N+1 — async loop over lazy loads
apps = (await session.execute(select(Application))).scalars().all()
for app in apps:
    notes = await session.execute(select(Note).where(Note.application_id == app.id))
```

### 3. Cursor Pagination on All List Methods

`PageResult` has ONE shape across the whole stack — `{ items, next_cursor, has_more }` where
`next_cursor` is the OPAQUE base64url token produced by `encode_cursor`. The repo decodes the
incoming token, keyset-paginates, and re-encodes the last row. Never expose `created_at`/`id`
cursor fields on the API or in `PageResult` (see `.claude/rules/api.md`).

**The cursor is adversarial input.** `decode_cursor` MUST catch malformed values
(`binascii.Error`, `json.JSONDecodeError`, `ValueError`, `UnicodeDecodeError`) and raise
`InvalidCursorError` (mapped to **400**). A raw `decode_cursor("null")` otherwise throws an
unhandled exception → **500**. (Found by schemathesis fuzzing `?cursor=null`.)

```python
# ✅ Cursor-based — opaque token in, opaque token out
from src.utils.cursor_util import decode_cursor, encode_cursor

async def list_applications(
    session: AsyncSession,
    user_id: UUID,
    cursor: str | None = None,   # opaque base64url token (or None for first page)
    limit: int = 20,
) -> PageResult[ApplicationResponse]:
    stmt = select(Application).where(Application.user_id == user_id, Application.deleted_at.is_(None))

    decoded = decode_cursor(cursor) if cursor else None   # {"created_at": iso_str, "id": uuid} | None
    if decoded:
        cursor_created_at = datetime.fromisoformat(decoded["created_at"])
        cursor_id = UUID(decoded["id"])
        stmt = stmt.where(
            or_(
                Application.created_at < cursor_created_at,
                and_(Application.created_at == cursor_created_at, Application.id < cursor_id),
            )
        )

    stmt = stmt.order_by(Application.created_at.desc(), Application.id.desc()).limit(limit + 1)
    rows = (await session.execute(stmt)).scalars().all()

    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = (
        encode_cursor({"created_at": items[-1].created_at.isoformat(), "id": str(items[-1].id)})
        if has_more and items
        else None
    )
    return PageResult(
        items=[ApplicationResponse.model_validate(r.__dict__) for r in items],
        next_cursor=next_cursor,   # single opaque token — matches api.md + frontend contract
        has_more=has_more,
    )

# ❌ FORBIDDEN — offset on large tables
stmt = select(Application).offset(page * limit).limit(limit)

# ❌ FORBIDDEN — leaking dual cursor fields (next_cursor_created_at / next_cursor_id)
```

### 4. Transactions for Multi-Table Writes

Atomicity is orchestrated by the SERVICE, but every `session.add` / ORM construction stays
inside a repo method. The repo is the ONLY layer that touches ORM models — services never
import `src/models` (see `ARCHITECTURE.md` import rules).

```python
# ✅ Service opens ONE transaction; repos do the ORM writes
# in application_service.create():
async with session.begin():
    app = await application_repo.create(session, user_id, data)
    await note_repo.create(session, app.id, content="Created", type="SYSTEM")
# commits on context exit, rolls back on exception

# ✅ Inside application_repo.create() — the repo owns ORM construction + validation:
async def create(session, user_id, data) -> ApplicationResponse:
    row = Application(user_id=user_id, **data.model_dump())
    session.add(row)
    await session.flush()
    return ApplicationResponse.model_validate(row.__dict__)

# ❌ Never construct ORM models or call session.add() in a service — that is the repo's job
# ❌ Never call external APIs inside a transaction block
```

### 5. Soft Delete Pattern
```python
# ✅ Model has deleted_at — filter in every query
stmt = select(Application).where(
    Application.user_id == user_id,
    Application.deleted_at.is_(None)    # always include this
)

# ✅ Soft delete (timezone-aware — datetime.utcnow() is deprecated in 3.12+)
row.deleted_at = datetime.now(UTC)   # from datetime import UTC — ruff UP017 prefers UTC over timezone.utc
await session.flush()

# ❌ Hard delete — only for GDPR with explicit comment
await session.delete(row)  # only if legally required
```

## Model Checklist (every new model)
- [ ] `deleted_at: Mapped[datetime | None]` — soft delete
- [ ] `id: Mapped[UUID]` with `default=uuid7` — time-ordered UUID
- [ ] `__table_args__` with indexes on FK + ORDER BY columns
- [ ] Partial index for `WHERE deleted_at IS NULL` queries
- [ ] `created_at`, `updated_at` with server defaults

## Migration Checklist (every new migration)
- [ ] Run `alembic revision --autogenerate -m "description"` then review output
- [ ] New indexes use `postgresql_concurrently=True`
- [ ] Both `upgrade()` and `downgrade()` implemented
- [ ] Run `alembic upgrade head` to verify
