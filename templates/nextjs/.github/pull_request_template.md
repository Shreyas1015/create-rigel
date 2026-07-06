<!--
  PR title format: <type>(<scope>): <summary>
  type ∈ feat | fix | chore | refactor | docs | test | perf
  Example: feat(applications): add application list feature
-->

## What does this PR do?

<!-- One sentence. Link the spec it came from. -->

- Spec: `docs/product-specs/ready/SPEC-XXX.md`

## Execution plan reference

<!-- Link the plan that drove this work. -->

- Plan: `docs/exec-plans/active/PLAN-XXX.md` (or completed/)
- Closes #

## Layers touched (check each, confirm its rule holds)

- [ ] **Types** — zero imports from other layers; no logic; never duplicates `api.generated.ts`
- [ ] **Lib** — `env.ts` Zod-validated (only place with `process.env`); `api-client.ts` via openapi-fetch `createClient`; auth token read from React context
- [ ] **Hooks** — TanStack Query wrapping `api-client`; no raw `fetch()`; loading/success/error states covered
- [ ] **Features** — no direct `fetch()`; no `process.env`; every `'use client'` has a `// Client: <reason>` comment
- [ ] **App** — pages are layout + data trigger only (no `useState`/`useEffect`/`fetch`); import feature components, not hooks
- [ ] **Utils** — zero domain imports; **100% test coverage**

## Gate check (all green)

- [ ] `tsc --noEmit` — type-check passes
- [ ] `eslint src/ app/ --max-warnings=0` — lint clean
- [ ] `prettier --check .` — formatting clean
- [ ] `vitest` — all tests pass
- [ ] Coverage meets per-layer thresholds (utils 100 · hooks 80 · features 70 · components 70) — enforced by `vitest.config.ts`
- [ ] Architecture tests pass (`vitest run tests/architecture/`)
- [ ] No file exceeds 400 lines

## Security checklist

- [ ] No `console.log` in `src/` or `app/`
- [ ] No raw `process.env` outside `src/lib/env.ts`
- [ ] No direct `fetch()` in components/features/pages (all API calls via `src/hooks/`)
- [ ] Access tokens in memory only — never `localStorage`/`sessionStorage`
- [ ] All images via `next/image` — no raw `<img>`
- [ ] `src/types/api.generated.ts` not hand-edited (regenerated via `/api-sync`)
- [ ] Cross-user isolation test **enabled** (remove `test.skip` in `tests/e2e/isolation.spec.ts`) for each new user-owned resource (User B → 404 on User A's resource)

## ADR

- [ ] A non-obvious architectural decision was made → ADR written in `docs/design-docs/decisions/`
- [ ] No ADR needed (nothing non-obvious)

## Breaking changes

- [ ] None
- [ ] Yes — documented below (API contract, env var, or config change)

<!-- If breaking: describe the change, the migration path, and rollback steps. -->
