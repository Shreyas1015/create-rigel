# CLAUDE.md — Agent Entry Point

You are an agent-first backend engineer working on a TypeScript + Express + Sequelize project.
Read this file first on every session. Then read the active execution plan before touching any code.

---

## Skill Freshness Check

Before following any skill that installs or configures a library (those with a non-empty `libraries:` list in their frontmatter — e.g. `/infra-setup`, `/build-layer`, `/db-optimize`, `/load-test`):

1. Read the skill's `verified:` date in its frontmatter.
2. If `verified:` is more than `staleness-threshold-days` (default 60) old:
   - For each library in `libraries:`, run `npm show <library> version` to confirm the latest stable version.
   - If the latest major version differs from what the skill assumes, check the library's changelog for breaking changes before proceeding.
   - Update the skill's `verified:` date and adjust its instructions if anything changed.
3. Skills with `libraries: []` are process-only — no freshness check needed.

If `npm show` / network is unavailable, fall back to the skill as written (degraded but functional) and note the staleness in your summary.

---

## Cardinal Rules (memorise these)

1. **Read the active plan first** — `docs/exec-plans/active/`
2. **If no plan exists** — run `/write-roadmap` (whole product) or `/write-spec` (one feature), then `/write-plan`, before any code
3. **Never write code without a plan** — document intent before implementation
4. **Gate must PASS before commit** — never skip `/validate-layer`
5. **Auto-fix gate failures** — fix silently, log what was fixed, re-run gate
6. **One layer at a time** — complete + gate + commit before the next

---

## Session Start Checklist

```
1. ls docs/exec-plans/active/          → is there an active plan?
2. If yes  → read it, find first unchecked layer, run /build-layer
3. If no   → ask human: whole product or one feature?
             whole product → /write-roadmap   |   one feature → /write-spec
4. Never assume — check the repo state first
```

---

## The Layer Build Loop (automated by /build-layer)

```
Read active plan
  → find first [ ] unchecked layer
  → read path-scoped rules for that layer type
  → write the layer files
  → run gate-checker agent
  → if FAIL: auto-fix all items, log fixes, re-run gate (max 3 attempts)
  → if PASS: update plan checkbox, write ADR if non-obvious decision, commit, push
  → present summary to human
  → WAIT for human confirmation before next layer
```

---

## Gate Failure = Auto-Fix (not escalation)

When the gate fails:
- Fix it yourself
- Log exactly what was fixed and why
- Re-run the gate
- Only escalate if the fix requires a product/architecture decision

---

## Observability on Every Boundary

Every service method must emit:
```typescript
logger.info({ event: 'domain.action', ...context, durationMs })
span.setAttributes({ ... })
```
No silent operations. No fire-and-forget without logging.

---

## Quick Reference

| Thing | Location |
|---|---|
| Navigation map | `AGENTS.md` |
| Layer rules | `ARCHITECTURE.md` |
| Active plan | `docs/exec-plans/active/` |
| Slash commands | `AGENTS.md#slash-commands` |
| Spec format | `docs/PLANS.md` |
| Quality grades | `docs/QUALITY_SCORE.md` |
| Tech debt | `docs/exec-plans/tech-debt-tracker.md` |
| Engineering beliefs | `docs/design-docs/core-beliefs.md` |

---

## Stack Reference

Versions are intentionally unpinned — `/infra-setup` installs the latest LTS of each.
Run the Skill Freshness Check before relying on version-specific behaviour.

```
Runtime:    Node 24 LTS, TypeScript, Express
ORM:        Sequelize + sequelize-typescript, sequelize-cli
Auth:       jose (JWT), argon2 (passwords)
Queue:      BullMQ + ioredis
Logging:    pino
Tracing:    OpenTelemetry SDK
Validation: zod
Security:   helmet, cors, express-rate-limit + rate-limit-redis
Testing:    jest, ts-jest, supertest
Tooling:    tsx, ESLint, prettier, madge, lint-staged (git hooks via .githooks/)
```
