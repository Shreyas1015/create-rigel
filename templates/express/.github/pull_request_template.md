<!--
  PR title format: <type>(<scope>): <summary>
  type ∈ feat | fix | chore | refactor | docs | test | perf
  Example: feat(applications): add stage-transition endpoint
-->

## What does this PR do?

<!-- One sentence. Link the spec it came from. -->

- Spec: `docs/product-specs/ready/SPEC-XXX.md`

## Execution plan reference

<!-- Link the plan that drove this work. -->

- Plan: `docs/exec-plans/active/PLAN-XXX.md` (or completed/)
- Closes #

## Layers touched (check each, confirm its rule holds)

- [ ] **Types** — zero imports from other layers; no logic
- [ ] **Config** — imports only from types/zod; `env.ts` Zod-validated
- [ ] **Models** — `paranoid: true`; UUIDv7 ids
- [ ] **Repo** — `Schema.parse(raw.toJSON())` on every result; ownership (`findByIdAndUser`); cursor pagination
- [ ] **Service** — no `express`/`Request`/`Response` imports; business logic only
- [ ] **Runtime** — order is auth → validate → service → respond; canonical envelope via `ok()`/`errorHandler`
- [ ] **Providers** — entered via explicit interface only
- [ ] **Utils** — zero domain imports; **100% test coverage**

## Gate check (all green)

- [ ] `tsc --noEmit` — type-check passes
- [ ] `eslint src/ --max-warnings=0` — lint clean
- [ ] `jest` — all tests pass
- [ ] Coverage meets per-layer thresholds (utils 100 · services 90 · repo 80 · routes 75 · providers 70)
- [ ] Architecture tests pass (`jest tests/architecture/`)
- [ ] No file exceeds 400 lines

## Security checklist

- [ ] No `console.*` in `src/` (use `logger`)
- [ ] No raw `process.env` outside `src/config/env.ts`
- [ ] Auth required on every protected endpoint (`requireAuth` first)
- [ ] `userId` scoped into every query (no cross-tenant leakage)
- [ ] Cross-user isolation test exists (User B → 404 on User A's resource)

## ADR

- [ ] A non-obvious architectural decision was made → ADR written in `docs/design-docs/decisions/`
- [ ] No ADR needed (nothing non-obvious)

## Breaking changes

- [ ] None
- [ ] Yes — documented below (API contract, DB migration, env var, or config change)

<!-- If breaking: describe the change, the migration path, and rollback steps. -->
