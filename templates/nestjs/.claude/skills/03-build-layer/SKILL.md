# /build-layer — Build Next Layer from Active Plan

Triggered by: `/build-layer` (no argument)

---

## Step 1 — Find Active Plan and Next Layer
```bash
PLAN=$(ls docs/exec-plans/active/*.md 2>/dev/null | head -1)
[[ -z "$PLAN" ]] && echo "No active plan. Run /write-plan first." && exit 1
cat "$PLAN"
```
Find first `[ ]` row. If all `[x]` → run `/garbage-collect`.

---

## Step 2 — Load Context
Read: active plan, spec, `ARCHITECTURE.md`, path-scoped rule:
- Model → `.claude/rules/database.md` + `.claude/rules/architecture.md`
- DTOs → `.claude/rules/api.md` + `.claude/rules/architecture.md`
- Repository → `.claude/rules/database.md` + `.claude/rules/security.md`
- Service → `.claude/rules/architecture.md` + `.claude/rules/security.md`
- Controller → `.claude/rules/api.md` + `.claude/rules/security.md`
- Module → `.claude/rules/architecture.md`
- Tests → `.claude/rules/testing.md`

---

## Step 3 — Build the Layer

### Model (`src/[feature]/models/[feature].model.ts`)
```typescript
import { Table, Column, Model, DataType, Default, DeletedAt, CreatedAt, UpdatedAt, BelongsTo, ForeignKey, HasMany, Index } from 'sequelize-typescript'
import { newId } from '../../utils/uuid.util'

@Table({
  tableName: 'applications',
  paranoid: true,   // ← always
  indexes: [
    { fields: ['user_id'] },
    { fields: ['user_id', 'stage'] },
  ],
})
export class Application extends Model {
  @Default(() => newId())   // ← UUIDv7 always
  @Column({ type: DataType.UUID, primaryKey: true })
  id!: string

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  userId!: string

  @Column(DataType.STRING(200)) company!: string
  @Column(DataType.STRING(200)) role!: string
  @Column({ type: DataType.ENUM(...STAGES), defaultValue: 'SAVED' }) stage!: string

  @CreatedAt createdAt!: Date
  @UpdatedAt updatedAt!: Date
  @DeletedAt deletedAt?: Date
}
```

### Migration (`db/migrations/YYYYMMDDHHMMSS-create-[feature].js`)
```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('applications', {
      id: { type: Sequelize.UUID, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      company: { type: Sequelize.STRING(200), allowNull: false },
      stage: { type: Sequelize.ENUM(...stages), defaultValue: 'SAVED' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
    })
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY idx_applications_user_id ON applications(user_id)'
    )
  },
  down: async (queryInterface) => queryInterface.dropTable('applications'),
}
```
Run: `npm run db:migrate`

### DTOs (`src/[feature]/dto/`)
```typescript
// create-application.dto.ts
import { IsString, IsOptional, MinLength, MaxLength, IsUrl } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateApplicationDto {
  @IsString() @MinLength(1) @MaxLength(200)
  @ApiProperty({ example: 'Acme Corp', description: 'Company name' })
  company: string

  @IsString() @MinLength(1) @MaxLength(200)
  @ApiProperty({ example: 'Software Engineer' })
  role: string

  @IsOptional() @IsUrl()
  @ApiPropertyOptional({ example: 'https://jobs.acme.com/123' })
  postingUrl?: string
}

// application-response.dto.ts — what we return (controls serialisation)
export class ApplicationResponseDto {
  @ApiProperty() id: string
  @ApiProperty() company: string
  @ApiProperty({ enum: ApplicationStage }) stage: ApplicationStage
  @ApiProperty() createdAt: string
}
```

### Repository (`src/[feature]/[feature].repository.ts`)
```typescript
@Injectable()
export class ApplicationRepository {
  constructor(
    @InjectModel(Application) private appModel: typeof Application,
    @InjectConnection() private sequelize: Sequelize,
  ) {}

  async findById(id: string, userId: string): Promise<ApplicationRecord> {
    const raw = await this.appModel.findOne({
      where: { id, userId },     // ownership always
      include: [{ model: Note }, { model: Contact }],  // eager load
    })
    if (!raw) throw new NotFoundException(`Application ${id} not found`)
    return ApplicationSchema.parse(raw.toJSON())  // Zod ALWAYS
  }

  async list(userId: string, cursor?: PageCursor, limit = 20): Promise<PageResult<ApplicationRecord>> {
    const where: WhereOptions = { userId }
    if (cursor) {
      where[Op.or as symbol] = [
        { createdAt: { [Op.lt]: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
      ]
    }
    const rows = await this.appModel.findAll({
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
}
```

### Service (`src/[feature]/[feature].service.ts`)
```typescript
@Injectable()
export class ApplicationService {
  private readonly logger = new Logger(ApplicationService.name)

  constructor(private readonly applicationRepository: ApplicationRepository) {}

  async findOne(userId: string, id: string): Promise<ApplicationRecord> {
    return this.applicationRepository.findById(id, userId)
    // NotFoundException thrown by repo if not found — no try/catch needed
  }

  async transitionStage(userId: string, id: string, to: ApplicationStage): Promise<ApplicationRecord> {
    const app = await this.applicationRepository.findById(id, userId)
    const validNext = VALID_TRANSITIONS[app.stage]
    if (!validNext.includes(to)) {
      throw new ConflictException(`Cannot transition from ${app.stage} to ${to}`)
    }
    const result = await this.applicationRepository.updateStage(id, to)
    this.logger.log({ event: 'application.stage_changed', id, from: app.stage, to })
    return result
  }
}
```

### Controller (`src/[feature]/[feature].controller.ts`)
```typescript
@ApiTags('Applications')
@ApiBearerAuth()
@Controller('v1/applications')
export class ApplicationController {
  constructor(private readonly appService: ApplicationService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get application by ID' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiNotFoundResponse()
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.appService.findOne(user.sub, id)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create application' })
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  create(@Body() dto: CreateApplicationDto, @CurrentUser() user: JwtPayload) {
    return this.appService.createApplication(user.sub, dto)
  }
}
```

### Module (`src/[feature]/[feature].module.ts`)
```typescript
@Module({
  imports: [SequelizeModule.forFeature([Application, Note, Contact])],
  controllers: [ApplicationController],
  providers: [ApplicationRepository, ApplicationService],
  exports: [ApplicationService],  // only if other modules need it
})
export class ApplicationModule {}
```
Then add to `AppModule.imports`.

### Tests
- `src/[feature]/[feature].service.spec.ts` — mock repository, test all error paths
- `test/[feature].e2e-spec.ts` — supertest full HTTP cycle

---

## Step 4 — Gate
Call `gate-checker` agent. Auto-fix failures. Re-run up to 3 times.

## Step 5 — ADR if needed
`docs/design-docs/decisions/ADR-XXX-{slug}.md`

## Step 6 — Commit
```bash
git add -A
git commit -m "{feat|chore|test}({feature}): {description}
PLAN-XXX Layer N/Total"
git push origin main
```

## Step 7 — Report + Wait
Show progress, auto-fixed items, ADR. Wait for human `yes` before next layer.
