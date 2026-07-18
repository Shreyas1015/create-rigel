# /infra-setup — Phase 0 Infrastructure Setup

> **Verified:** 2026-06-18 · **Staleness threshold:** 60 days
> **Sources:** create-next-app (https://nextjs.org/docs/app/api-reference/cli/create-next-app) ·
> shadcn/ui (https://ui.shadcn.com/docs/cli) · TanStack Query (https://tanstack.com/query) ·
> ESLint flat config (https://eslint.org/docs/latest/use/configure/configuration-files)
> If older than the threshold, fetch current docs via `ctx7` (resolve library → fetch docs),
> or via `WebFetch`/`WebSearch` if ctx7 is unavailable, **before** following the commands.

Triggered by: `/infra-setup`
Run ONCE. Check if `package.json` exists first — if yes, abort (already set up).

---

## How to run this skill (two phases)

**Phase A — scaffold the Next.js app (Step 1 below).** `create-next-app` refuses to run
in a non-empty directory, and this harness ships files (`.claude/`, `.github/`, `docs/`,
configs…) that it treats as conflicts. So Step 1 **parks the harness files aside**, runs
the plain `npx create-next-app@latest .` into the now-empty root, then **restores** them.
Run this block directly — it cannot be a script, because any script under `.claude/`
would be parked away mid-run.

**Phase B — deterministic setup (Steps 2–4 + scripts + git hooks).** Once the app exists,
run the checked-in script — identical every time:

```bash
bash .claude/scripts/infra-setup.sh
```

Then **you** author the harness glue (Step 5) and config edits (Steps 6–8), which need
judgement and cannot be scripted. The Steps below document what runs (so they can be
audited/updated when the Verified date is stale) and what you must hand-author.

> If a command fails on a tool version change, fix it, re-run, and bump the `Verified:`
> date above — do not silently hand-run divergent commands.

---

## Cardinal Scaffolding Rule

**Never hand-write boilerplate the CLI can generate.**
`create-next-app` and `npx shadcn` own the app shell, root layout, base pages, and UI
components. Dependencies install at their **latest LTS** — no version pins (bare
`npm install <pkg>`). Hand-authoring is restricted to **harness glue with no generator**
(see Step 5). If a generator exists for an artifact, run it and edit its output rather
than writing the file from scratch.

---

## Step 1 — Create Next.js App (park → scaffold → restore)

Run this block **directly** (not via a script — `.claude/` gets parked). It moves the
harness files aside, runs the plain `create-next-app` in the empty root, then restores
the harness on top of the generated app (our files win on the one overlap, `.gitignore`).

```bash
# Abort if already set up
[ -f package.json ] && { echo "package.json exists — infra already run. Aborting."; exit 1; }

# 1. Park every harness file create-next-app would treat as a conflict.
#    CRITICAL: park to a dir OUTSIDE the project. create-next-app refuses to run if the
#    cwd contains ANYTHING except a known-safe allowlist (.git is fine) — a `.harness-hold`
#    SUBDIR would itself be flagged as a conflict and abort the scaffold. So park to an
#    external temp dir, leaving only .git behind.
#    eslint.config.mjs is parked too — we restore OUR version on top so it wins over
#    the one create-next-app generates (it carries the layer-boundary rules).
HOLD=$(mktemp -d)
for f in .claude .github .githooks .rigel scripts docs \
         .prettierrc .prettierignore .lintstagedrc.json .gitattributes .gitignore .mcp.json \
         eslint.config.mjs Dockerfile .dockerignore Makefile \
         lighthouserc.js AGENTS.md ARCHITECTURE.md QUICKSTART.md; do
  [ -e "$f" ] && mv "$f" "$HOLD"/
done

# 2. Scaffold into the now-empty root (plain, non-interactive)
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --turbopack --use-npm --yes

# 3. Restore the harness on top (clobber: our .gitignore/configs win over generated)
cp -a "$HOLD"/. ./
rm -rf "$HOLD"
```

> If `create-next-app` lists a NEW conflicting file not in the park list above, add it to
> the `for f in …` list and re-run. `.git` is never parked (create-next-app tolerates it).

## Step 2 — Install All Dependencies
> Steps 2–4 + package.json scripts + git-hook activation are performed by `bash .claude/scripts/infra-setup.sh`.
> The detail below documents what that script runs.
```bash
# Server state + API contract
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install openapi-fetch
npm install -D openapi-typescript

# Client state
npm install zustand

# Forms + validation
npm install react-hook-form @hookform/resolvers zod

# shadcn/ui CLI
npm install -D shadcn

# Testing
npm install -D vitest @vitejs/plugin-react jsdom
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D msw playwright @playwright/test
npm install -D @vitest/coverage-v8

# Performance
npm install -D @next/bundle-analyzer

# Linting (the committed eslint.config.mjs uses Next's native flat config — no FlatCompat)
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-import
```

## Step 3 — Initialise shadcn/ui
```bash
npx shadcn init
# Select: Default style, CSS variables for colors
# This creates components.json and src/components/ui/
```

Add base components:
```bash
npx shadcn add button input label form card dialog toast badge skeleton
```

## Step 4 — Directory Structure
```bash
mkdir -p \
  src/types \
  src/lib \
  src/hooks \
  src/store \
  src/features \
  src/components/shared \
  src/utils \
  tests/unit/{hooks,features,components,utils} \
  tests/e2e \
  tests/visual \
  tests/architecture \
  tests/mocks \
  docs/{product-specs/{draft,ready},exec-plans/{active,completed},design-docs/decisions,generated}
```

## Step 5 — Create Harness Glue (only files with no CLI generator)

Per the Cardinal Scaffolding Rule, Claude authors **only** the files below — none of
these can be produced by `create-next-app` or `npx shadcn`. The root layout, base
page, and all UI components come from the generators (Step 1 + Step 3); do **not**
re-create them. Auth/dashboard route groups and their pages are **feature-build
concerns**, not Phase 0 — they are created later by `/build-layer`, not here.

### src/lib/env.ts
Zod-validated NEXT_PUBLIC_* env vars. `process.env` ONLY here.
Schema includes: `NEXT_PUBLIC_API_URL`.
On invalid: `console.error` + `throw new Error` (not process.exit — browser context).

### src/lib/api-client.ts
openapi-fetch `createClient<paths>` instance.
Auth middleware reads token from React context.
Base URL from `env.NEXT_PUBLIC_API_URL`.
Import type `paths` from `@/types/api.generated` (will exist after /api-sync).
**REQUIRED: pass a lazy `fetch`** so MSW can intercept in tests — openapi-fetch binds
`globalThis.fetch` at client-creation time (before MSW patches it in `beforeAll`), so a
client created at import time would capture the un-patched fetch and every hook test
would hit the real network (flaky `ECONNREFUSED`). Wrap it:
```typescript
export const apiClient = createClient<paths>({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  fetch: (...args) => globalThis.fetch(...args), // lazy — lets MSW intercept in tests
})
```

### src/lib/constants.ts
App-wide constants. No process.env.

### Script-written glue (do NOT hand-author — `infra-setup.sh` writes these)
- `src/lib/logger.ts` — zero-dep structured JSON logger (the only sanctioned logging path)
- `src/lib/api-error.ts` — `toApiError`/`ApiError` (normalises the canonical error envelope)
- `src/instrumentation.ts` — Next.js boot/observability seam
- `src/app/global-error.tsx` — root error boundary that reports via the logger
- `.env.example`, the per-layer `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`,
  `tests/architecture/layers.test.ts`, `tests/e2e/isolation.spec.ts` (+ `helpers/auth.ts`),
  and `tests/load/{smoke,stress,soak}.js`
- **Deterministic evals (PLAN-003):** `vitest.acceptance.config.ts` (runs the acceptance
  HOLDOUT, which is excluded from the default `vitest run`), `stryker.conf.json` (Vitest-runner
  mutation config — a nightly alarm, never a gate), `tests/acceptance/.gitkeep`, and the two
  extra arch tests `tests/architecture/traceability.test.ts` +
  `tests/architecture/assertion-integrity.test.ts` (the STATIC AC checks that run in the gate).
  `stryker.conf.json` and the `tests/` files are script-written (not committed at the template
  root) precisely because a stray root file / `tests/` dir would make `create-next-app` abort
  the park-and-restore scaffold.
- **Committed eval scripts** (survive scaffold via the `scripts/` park-and-restore, so NOT
  written by the script): `scripts/lib/rigel-evals.mjs`, `scripts/redgreen-record.mjs`,
  `scripts/ac-vector.mjs`, `scripts/mutation-report.mjs`. The nightly workflow
  `.github/workflows/mutation-nightly.yml` ships the same way.

### src/utils/cn.util.ts
`clsx` + `tailwind-merge` class merger. 100% tested.
(Note: `npx shadcn init` may also generate a `cn` helper in `src/lib/utils.ts` —
if so, re-export from there instead of duplicating.)

### src/utils/format-date.util.ts
Date formatting helpers. 100% tested.

### src/utils/parse-error.util.ts
Safely extract error message from unknown. 100% tested.

### src/store/ui-store.ts
Zustand store for UI-only state: `sidebarOpen`, `activeModal`.

### src/types/domain.types.ts
Placeholder — frontend-only types added here as features are built.

### src/types/api.generated.ts
Placeholder with comment: `// READ ONLY — regenerate with: npm run api:sync`
Actual content generated by /api-sync after OpenAPI spec is available.

### tests/mocks/server.ts + tests/mocks/handlers.ts
MSW server setup for Vitest.

### tests/utils/create-wrapper.tsx
React QueryClient wrapper for renderHook tests.

### tests/architecture/layers.test.ts — WRITTEN BY THE SCRIPT (do not hand-author)
Dependency-free import-graph structural tests (Node `fs` only). **`.claude/scripts/infra-setup.sh`
(Step 6) writes this file**, so the gate is deterministic, not improvised — the gate
(`tests/architecture/`) and CI both depend on this exact file. Shown here for reference:

```typescript
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Layer import rules. A layer must NOT import from any of its "forbidden" layers.
// Aliases are matched as `@/<layer>` and bare `app/` imports.
const RULES: Record<string, string[]> = {
  'src/types': ['@/lib', '@/hooks', '@/features', '@/store', '@/components'],
  'src/lib': ['@/hooks', '@/features', '@/components'],
  'src/store': ['@/hooks', '@/features', '@/components'],
  'src/hooks': ['@/features', '@/components'],
  'src/features': ['app/'],
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(full) && !full.endsWith('.d.ts') ? [full] : []
  })
}

const IMPORT_RE = /(?:import|from)\s+['"]([^'"]+)['"]/g

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1])
  return out
}

describe('layer import rules', () => {
  for (const [layer, forbidden] of Object.entries(RULES)) {
    it(`${layer} does not import from ${forbidden.join(', ')}`, () => {
      const violations: string[] = []
      for (const file of walk(layer)) {
        for (const imp of importsOf(file)) {
          const hit = forbidden.some((f) => {
            const base = f.endsWith('/') ? f.slice(0, -1) : f
            return imp === base || imp.startsWith(base + '/')
          })
          if (hit) violations.push(`${file} → ${imp}`)
        }
      }
      expect(violations, violations.join('\n')).toHaveLength(0)
    })
  }
})

describe('app pages contain no business logic', () => {
  it('page.tsx files import features, not hooks directly', () => {
    const pages = walk('app').filter((f) => f.endsWith('page.tsx'))
    const violations = pages.filter((f) =>
      importsOf(f).some((imp) => imp.startsWith('@/hooks')),
    )
    expect(violations, violations.join('\n')).toHaveLength(0)
  })
})
```

### src/components/providers.tsx
`'use client'` Providers component: QueryClientProvider (+ devtools), toast provider.
This holds the client-side context that the generated root layout cannot.

### Wire providers into the generated layout (edit, not rewrite)
`app/layout.tsx` is generated by `create-next-app`. **Edit** it to wrap `{children}`
in `<Providers>` from `src/components/providers.tsx`. Keep the generated font setup and
metadata; do not rewrite the file from scratch.

## Step 6 — Config Files

`create-next-app` already generated `next.config.ts` and `tsconfig.json`. **Edit**
`next.config.ts` to add the settings below — do not recreate it.

`vitest.config.ts`, `playwright.config.ts`, and `tests/setup.ts` are **written by
`.claude/scripts/infra-setup.sh` (Step 5)** — do not author them by hand. The
`vitest.config.ts` it writes carries the **per-layer coverage thresholds** (utils 100 ·
hooks 80 · features 70 · components 70) that match `.claude/rules/testing.md`; they are
real, machine-enforced gates, not prose. Shown below for reference.

`eslint.config.mjs` is **committed by the harness** and restored on top of the generated
one (Step 1 park-and-restore) — it carries the layer-import boundaries. Do not hand-edit
boundaries into the generated file; edit the committed `eslint.config.mjs` instead.

### next.config.ts (base is SCRIPT-WRITTEN; you only add version-gated extras)
`infra-setup.sh` (Step 5) overwrites the generated `next.config.ts` with a base that has
`output: 'standalone'` (required by the Dockerfile) + security headers. **Only** add
`reactCompiler`/`typedRoutes` here if you've confirmed the installed Next version supports
them (they're version-sensitive — `reactCompiler` may need `babel-plugin-react-compiler`,
and `typedRoutes` moved out of `experimental`). Full reference shape:
```typescript
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  output: 'standalone',  // minimal server bundle for the Docker runner stage (script writes this)
  reactCompiler: true,  // OPTIONAL — only if the installed Next version supports it
  experimental: {
    typedRoutes: true,  // OPTIONAL — note: top-level `typedRoutes` in newer Next
  },
  // Security headers
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }]
  },
}
export default nextConfig
```

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/types/api.generated.ts', 'src/components/ui/**'],
      thresholds: { lines: 70, functions: 70, branches: 65 },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

### playwright.config.ts
```typescript
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### tests/setup.ts
```typescript
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

### package.json scripts (the script in `.claude/scripts/infra-setup.sh` adds these)
`dev` / `build` / `start` keep create-next-app's values; the harness adds the rest.
Note `lint` uses **`eslint .`** (flat config), NOT the deprecated `next lint`, and `gate`
is the single command `/push-layer` and `/validate-layer` run.
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "api:sync": "openapi-typescript openapi.json -o src/types/api.generated.ts",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:visual": "playwright test tests/visual/",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "gate": "npm run typecheck && npm run lint && npm run format:check && npm run test:coverage",
    "redgreen:record": "node scripts/redgreen-record.mjs",
    "ac:vector": "node scripts/ac-vector.mjs",
    "gate:final": "npm run gate && npm run ac:vector",
    "analyze": "ANALYZE=true next build"
  }
}
```

The deterministic-eval scripts (PLAN-003):
- `gate` already runs the **STATIC** AC checks — `test:coverage` runs `vitest run --coverage`,
  which includes `tests/architecture/` (traceability + assertion-integrity). No separate
  `test:arch` script is needed. `tests/acceptance/` is EXCLUDED from that run (it is the
  red-mid-build holdout), so the gate never fails on unbuilt acceptance tests.
- `redgreen:record` — run once by `/write-spec` to prove every acceptance test is red before
  implementation (writes `.rigel/redgreen/SPEC-XXX.json`).
- `ac:vector` — the feature-completion PASS/FAIL vector, run by `/garbage-collect`. Runs the
  acceptance holdout via `vitest.acceptance.config.ts`; non-zero unless every AC is PASS.
- `gate:final` — the whole-feature check: the per-layer gate plus the AC vector.

### Committed dev-experience tooling (already in the template — no authoring needed)
These files ship with the template; the script installs their deps and activates the git hooks
(`git config core.hooksPath .githooks` — no husky, no `prepare` script):
- `.prettierrc` + `.prettierignore` — Prettier (with `prettier-plugin-tailwindcss`)
- `.lintstagedrc.json` + `.githooks/pre-commit` — pre-commit runs `lint-staged`
  (eslint --fix + prettier on staged files)
- `.githooks/commit-msg` + `.githooks/pre-push` — Conventional Commits + branch-name
  enforcement, toolchain-free and identical across every template (read from `.rigel/git-policy.json`)
- `.github/workflows/ci.yml` — typecheck · lint · format · test · build on PR
- `.github/workflows/git-policy.yml` — branch name · commit range · PLAN reference · protection drift
- `.github/workflows/lighthouse.yml` + `lighthouserc.js` — Core Web Vitals budget
- `docs/design-docs/team-workflow.md` + `docs/git-workflow.md` — branch model + one-time protection setup

### .env.example
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Step 7 — ESLint Config (committed `eslint.config.mjs` — nothing to author)
The harness ships `eslint.config.mjs` (restored over the generated one in Step 1). It
already enforces, mechanically:
- `no-restricted-syntax` blocking `process.env` outside `src/lib/` and direct `fetch()`
  outside the hooks layer
- `no-restricted-imports` enforcing the full layer-import matrix (and "no `@/hooks` in
  pages")
- `no-console` at warning level
- `eslint-config-prettier` LAST so Prettier owns formatting
To change a boundary, edit the committed `eslint.config.mjs` — do NOT add rules to a
generated file that the next scaffold would overwrite.

## Step 8 — Write ADR-000
`docs/design-docs/decisions/ADR-000-infrastructure.md`
Document stack choices: Next.js, openapi-typescript, TanStack Query, Zustand, Vitest.

## Gate Check
```bash
npm run gate   # typecheck + lint (flat config) + format:check + test:coverage (incl. tests/architecture/)
```

## Commit
```bash
git add -A
git commit -m "chore(infra): phase 0 infrastructure setup

- Next.js + React + TypeScript strict (latest LTS, no version pins)
- TanStack Query + openapi-fetch (API contract layer)
- Zustand (UI state)
- shadcn/ui + Tailwind CSS
- Vitest + Playwright + MSW
- Security headers in next.config.ts
- React Compiler enabled
- Architecture structural tests
- ADR-000: infrastructure decisions"
git push origin main
```
