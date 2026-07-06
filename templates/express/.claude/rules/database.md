---
paths:
  - "src/repo/**/*.ts"
  - "src/models/**/*.ts"
  - "db/migrations/**/*.js"
---

# Database Rules — Auto-injected on repo/model/migration edits

## The 5 Checks Before Every Repo Method Ships

### 1. Zod Parse on Every Result
```typescript
// ✅ REQUIRED
const raw = await Application.findByPk(id)
if (!raw) throw new NotFoundError(`Application ${id} not found`)
return ApplicationSchema.parse(raw.toJSON())

// ❌ FORBIDDEN — implicit trust of DB output
return raw as Application
```

### 2. No N+1 — Eager Load Always
```typescript
// ✅ Single query
const apps = await Application.findAll({
  where: { userId },
  include: [
    { model: Note },
    { model: Contact },
    { model: Reminder },
  ],
})

// ❌ N+1 — DB called inside loop
const apps = await Application.findAll({ where: { userId } })
for (const app of apps) {
  app.notes = await Note.findAll({ where: { applicationId: app.id } }) // N queries
}
```

### 3. Cursor Pagination on All List Methods
```typescript
// ✅ Cursor-based
async function list(userId: string, cursor?: PageCursor, limit = 20) {
  const where: WhereOptions = { userId }
  if (cursor) {
    where[Op.or] = [
      { createdAt: { [Op.lt]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
    ]
  }
  const rows = await Application.findAll({
    where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: limit + 1,
  })
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  return {
    items: items.map(r => ApplicationSchema.parse(r.toJSON())),
    nextCursor: hasMore ? { id: items.at(-1)!.id, createdAt: items.at(-1)!.createdAt } : null,
    hasMore,
  }
}

// ❌ FORBIDDEN on tables > 10k rows
Application.findAll({ offset: page * limit, limit })
```

### 4. Transactions for Multi-Table Writes
```typescript
// ✅ REQUIRED when writing > 1 table
return sequelize.transaction(async (t) => {
  await Application.update({ stage }, { where: { id }, transaction: t })
  await Note.create({ applicationId: id, content, type: 'SYSTEM' }, { transaction: t })
})

// No external API calls inside a transaction
```

### 5. Soft Delete — paranoid: true
```typescript
// Model must have paranoid: true
@Table({ tableName: 'applications', paranoid: true })
export class Application extends Model { ... }

// findAll automatically filters deleted — no manual where needed
await Application.findAll({ where: { userId } })  // deleted_at IS NULL automatic

// Explicit include-deleted (opt-in only)
await Application.findAll({ where: { userId }, paranoid: false })
```

## Model Checklist (every new model)
- [ ] `@Table({ paranoid: true })` — soft delete
- [ ] `@Default(() => newId())` on id — UUIDv7
- [ ] `indexes` array defined on `@Table`
- [ ] FK columns have index
- [ ] ORDER BY columns have index
- [ ] Partial index for `WHERE deleted_at IS NULL` queries

## Migration Checklist (every new migration)
- [ ] New indexes use `CONCURRENTLY`
- [ ] FK constraints defined with explicit `ON DELETE` behaviour
- [ ] Both `up` and `down` implemented
