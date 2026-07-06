---
paths:
  - "src/**/*.repository.ts"
  - "src/**/*.model.ts"
  - "db/migrations/**/*.js"
---

# Database Rules — Auto-injected on repository/model/migration edits

## The 5 Checks Before Every Repository Method Ships

### 1. Zod Parse on Every Result
```typescript
// ✅ REQUIRED
const raw = await this.userModel.findOne({ where: { email } })
if (!raw) return null
return UserSchema.parse(raw.toJSON())

// ❌ FORBIDDEN
return raw                         // Sequelize instance — unvalidated
return raw.toJSON() as UserRecord  // cast without validation
```

### 2. No N+1 — Eager Load Always
```typescript
// ✅ Single query with include
const apps = await this.appModel.findAll({
  where: { userId },
  include: [
    { model: Note },
    { model: Contact },
  ],
})

// ❌ N+1
const apps = await this.appModel.findAll({ where: { userId } })
for (const app of apps) {
  app.notes = await this.noteModel.findAll({ where: { applicationId: app.id } })
}
```

### 3. Cursor Pagination on All List Methods
```typescript
// ✅ Cursor-based
async list(userId: string, cursor?: PageCursor, limit = 20) {
  const where: WhereOptions = { userId }
  if (cursor) {
    where[Op.or as symbol] = [
      { createdAt: { [Op.lt]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
    ]
  }
  const rows = await this.appModel.findAll({
    where, include: [...],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: limit + 1,
  })
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  return {
    items: items.map(r => ApplicationSchema.parse(r.toJSON())),
    nextCursor: hasMore ? { id: items.at(-1)!.id, createdAt: items.at(-1)!.createdAt } : null,
    hasMore,
  }
}

// ❌ FORBIDDEN on growing tables
findAll({ offset: page * limit, limit })
```

### 4. Transactions for Multi-Table Writes
```typescript
// ✅ Inject Sequelize and use transaction
constructor(
  @InjectModel(Application) private appModel: typeof Application,
  @InjectConnection() private sequelize: Sequelize,
) {}

async updateStage(id: string, stage: string, note: string) {
  return this.sequelize.transaction(async (t) => {
    await Application.update({ stage }, { where: { id }, transaction: t })
    await Note.create({ applicationId: id, body: note, type: 'SYSTEM' }, { transaction: t })
  })
}
```

### 5. Soft Delete — paranoid: true
```typescript
// ✅ @Table decorator
@Table({ tableName: 'applications', paranoid: true })
export class Application extends Model {
  @DeletedAt deletedAt?: Date
}

// findAll automatically excludes soft-deleted — no manual WHERE needed
// To include deleted: { paranoid: false }
// Hard delete: { force: true } — only for GDPR
```

## Model Checklist
- [ ] `@Table({ paranoid: true })` — soft delete
- [ ] `@Default(() => newId())` on id — UUIDv7
- [ ] `indexes` array in `@Table` — FK columns + ORDER BY columns
- [ ] Partial index for `WHERE deleted_at IS NULL` if high-volume
- [ ] `@CreatedAt`, `@UpdatedAt`, `@DeletedAt` decorators

## Migration Checklist
- [ ] Both `up()` and `down()` implemented
- [ ] New indexes use `CONCURRENTLY` to avoid table locks
- [ ] FK constraints with explicit `ON DELETE` behaviour
- [ ] Run `npm run db:migrate` to verify before committing
