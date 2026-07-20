---
name: 04-build-layer
description: /build-layer — Build Next Layer from Active Plan
verified: 2026-06-04
libraries: [express, sequelize, sequelize-typescript, zod, jose, bullmq, pino]
source: https://www.npmjs.com
staleness-threshold-days: 60
---

# /build-layer — Build Next Layer from Active Plan

Triggered by: `/build-layer` (no argument — reads active plan automatically)

---

## Step 1 — Find the Active Plan and Next Layer

```bash
# Find active plan
PLAN=$(ls docs/exec-plans/active/*.md 2>/dev/null | head -1)

if [[ -z "$PLAN" ]]; then
  echo "No active plan found. Run /write-plan first."
  exit 1
fi

echo "Active plan: $PLAN"
cat "$PLAN"
```

Parse the **Build Order** table in the plan.
Find the first row with `[ ]` (unchecked) — this is the layer to build.
If all rows are `[x]` (checked) → all layers complete, run `/garbage-collect`.

---

## Step 2 — Load Context for This Layer

Read these files before writing a single line of code:
1. The active plan (already loaded)
2. The spec linked in the plan (`docs/product-specs/ready/SPEC-XXX.md`)
3. `ARCHITECTURE.md` — layer rules
4. The path-scoped rule for this layer type:
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

Write only the files for this layer. Follow the layer rules exactly.

### Layer-specific what-to-build guide:

**Types layer** — `src/types/`
- One file per domain entity: `{entity}.types.ts`
- Interfaces, enums, Zod schemas, type aliases
- `common.types.ts` for shared types: `PageCursor`, `PageResult<T>`, `ApiSuccess<T>`, `ApiError`
- Zero imports. Zero logic.

**Config layer** — `src/config/`
- Update `env.ts` if new env vars needed (add to Zod schema + `.env.example`)
- `constants.ts` for domain constants (stage arrays, limits, etc.)

**Models layer** — `src/models/`
- One file per entity: `{Entity}.model.ts`
- Sequelize-typescript decorators
- `paranoid: true` on every `@Table`
- `@Default(() => newId())` on every `id` column
- `indexes` array defined on `@Table` for FK + ORDER BY columns
- Export all models from `src/models/index.ts`, and register them there with
  `sequelize.addModels([...])` (`import 'reflect-metadata'` first). Config and runtime must not
  import the models layer — `models → config` is the legal registration edge.

**Migrations layer** — `db/migrations/`
- One migration per table: `YYYYMMDDHHMMSS-create-{table}.js`
- `up`: createTable + addIndex (CONCURRENTLY for new indexes)
- `down`: dropTable
- Run: `npx sequelize-cli db:migrate` to verify

**Repo layer** — `src/repo/`
- One file per entity: `{entity}.repo.ts`
- EVERY method: `Schema.parse(raw.toJSON())` on results
- List methods: cursor-based pagination (Op.lt on createdAt + id)
- Ownership: `findOne({ where: { id, userId } })` — never `findByPk(id)` alone
- Zod schemas for all entity shapes
- Export from `src/repo/index.ts`

**Service layer** — `src/services/`
- One file per domain: `{domain}.service.ts`
- Takes domain types as input, returns domain types
- NO `Request`, `Response`, `express` imports
- Business logic lives here: state machines, validations, orchestration
- External calls → via Repo layer
- Async jobs → enqueue via queue (don't process inline)
- Wrap multi-table operations in `sequelize.transaction()`

**Runtime layer** — `src/runtime/routes/v1/`
- One file per resource: `{resource}.route.ts`
- Handler order: auth → validate → service → respond → catch
- All routes under `/api/v1/`
- Use `ok()` and `err()` helpers for all responses
- Rate limiting applied at router level

**Workers layer** — `src/runtime/workers/`
- One file per queue: `{name}.worker.ts`
- Validate payload with Zod first
- Log start/complete/failed
- Re-throw on error (BullMQ handles retry)
- Register shutdown hook in server.ts

**Tests layer** — `tests/`
- `tests/unit/services/{service}.test.ts` — service layer
- `tests/unit/utils/{util}.test.ts` — utils
- `tests/integration/{feature}.test.ts` — route-level
- `tests/integration/{resource}.isolation.test.ts` — REQUIRED for every owned resource
  (copy `tests/integration/isolation.test.template.ts`); `tests/architecture/isolation.test.ts`
  fails the gate if a userId-scoped repo has no matching isolation test
- Meet coverage thresholds from `.claude/rules/testing.md`

---

## Step 4 — Run Gate

Call the `gate-checker` agent with the layer name.

**If FAIL:**
- Read each ITEM from the gate report
- Fix it automatically (no asking the human)
- Log: `[Auto-fix] item description → fix applied`
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
- Tick the checkbox in the plan:
  `- [ ] Layer N: Types` → `- [x] Layer N: Types`
- Write ADR if any non-obvious decision was made during this layer

---

## Step 5 — Write ADR (if needed)

An ADR is needed when you made a decision that a future engineer would question.
Examples: chose approach A over B, moved responsibility between layers, added a constraint.

```markdown
# ADR-XXX — [Short Decision Title]

**Date:** YYYY-MM-DD
**Plan:** PLAN-XXX Layer N
**Status:** ACCEPTED

## Context
What situation forced this decision?

## Decision
What was chosen.

## Alternatives Considered
- Option A: [why not chosen]
- Option B: [why not chosen]

## Consequences
What this decision costs / enables.
```

Save to: `docs/design-docs/decisions/ADR-XXX-{slug}.md`
Update: `docs/design-docs/decisions/index.md`

---

## Step 6 — Commit and Push

```bash
git add -A
git commit -m "{type}({scope}): {description}

{bullet points of what was built}

PLAN-XXX Layer N/Total"

# Push the CURRENT feature branch — never main (it's protected; the loop lands via /open-pr).
git push origin "$(git branch --show-current)"
```

Conventional commit types: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`
Scope: layer name (types, config, models, repo, service, runtime, worker, tests)

---

## Step 7 — Report to Human

```
═══════════════════════════════════════════
✅ Layer N ({layer-name}) — COMPLETE
═══════════════════════════════════════════
Files created: [list]
Gate attempts: 1 (or N with auto-fixes)
Auto-fixed:    [list of fixes if any]
ADR written:   ADR-XXX / None needed
Committed:     [commit hash]

Progress: [x] Layer 1 [x] Layer 2 [ ] Layer 3 ...

Ready for Layer N+1: {next-layer-name}
Confirm to continue? [human must respond]
═══════════════════════════════════════════
```

**Wait for human confirmation before building the next layer.**
Human response of "yes", "y", "continue", "proceed" or similar → start next layer.
