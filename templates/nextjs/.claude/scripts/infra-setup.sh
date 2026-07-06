#!/usr/bin/env bash
# .claude/scripts/infra-setup.sh
# Deterministic POST-SCAFFOLD setup: deps + shadcn + dirs + package.json scripts +
# gate-critical config/test/observability files + husky.
# Run via: bash .claude/scripts/infra-setup.sh
#
# PRECONDITION: the Next.js app is already scaffolded (Step 1 of the skill runs
# `create-next-app` via the park-and-restore sequence — it cannot live here because
# this script's own home (.claude/) is one of the files that gets parked aside).
# After this finishes, Claude authors the remaining harness glue (Step 5 of the skill).
#
# No version pins for libraries — everything resolves to latest LTS. Reproducibility
# is provided instead by the committed package-lock.json + `npm ci` in CI + Dependabot.

set -euo pipefail

if [[ ! -f package.json ]]; then
  echo "❌ No package.json — run the scaffold step first (Step 1 of /infra-setup:"
  echo "   park harness files → npx create-next-app@latest . → restore). Aborting."
  exit 1
fi

# write_if_absent <path>  ← content on stdin. Never clobbers an existing file, so a
# re-run (or a user edit) is safe. Harness-owned files are created exactly once.
write_if_absent() {
  local p="$1"
  if [[ -e "$p" ]]; then
    echo "  • skip $p (exists)"
    cat >/dev/null
    return
  fi
  mkdir -p "$(dirname "$p")"
  cat >"$p"
  echo "  • wrote $p"
}

echo "▶ Step 1 — install dependencies (latest LTS, no pins)"
# Server state + API contract
npm install @tanstack/react-query @tanstack/react-query-devtools openapi-fetch
npm install -D openapi-typescript
# Client state
npm install zustand
# Forms + validation
npm install react-hook-form @hookform/resolvers zod
# Testing
npm install -D vitest @vitejs/plugin-react jsdom @vitest/coverage-v8
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D msw @playwright/test
# Performance
npm install -D @next/bundle-analyzer
# Linting (the committed eslint.config.mjs uses Next's native flat config — no FlatCompat)
npm install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-import
# Formatting + pre-commit (config files are committed in the template)
npm install -D prettier prettier-plugin-tailwindcss eslint-config-prettier husky lint-staged
# Core Web Vitals budget (config/workflows committed in the template)
npm install -D @lhci/cli

echo "▶ Step 2 — shadcn/ui init + base components (non-interactive)"
npx shadcn@latest init -d
npx shadcn@latest add -y button input label form card dialog sonner badge skeleton

echo "▶ Step 3 — directory structure"
mkdir -p \
  src/types src/lib src/hooks src/store src/features src/components/shared src/utils \
  tests/unit/hooks tests/unit/features tests/unit/components tests/unit/utils \
  tests/e2e tests/e2e/helpers tests/visual tests/architecture tests/load tests/mocks tests/utils \
  docs/product-specs/draft docs/product-specs/ready \
  docs/exec-plans/active docs/exec-plans/completed \
  docs/design-docs/decisions docs/generated

echo "▶ Step 4 — package.json scripts (patched via node, no clobber of dev/build/start)"
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
// Defaults fill in if create-next-app's names ever change; existing scripts win over
// them; harness scripts win over everything (notably: lint = 'eslint .', not 'next lint').
const defaults = { dev: 'next dev', build: 'next build', start: 'next start' };
const harness = {
  'api:sync': 'openapi-typescript openapi.json -o src/types/api.generated.ts',
  'test': 'vitest',
  'test:ui': 'vitest --ui',
  'test:coverage': 'vitest run --coverage',
  'test:e2e': 'playwright test',
  'test:visual': 'playwright test tests/visual/',
  'typecheck': 'tsc --noEmit',
  'lint': 'eslint .',
  'lint:fix': 'eslint . --fix',
  'format': 'prettier --write .',
  'format:check': 'prettier --check .',
  'gate': 'npm run typecheck && npm run lint && npm run format:check && npm run test:coverage',
  'analyze': 'ANALYZE=true next build',
  'prepare': 'husky',
};
p.scripts = Object.assign(defaults, p.scripts, harness);
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('  scripts:', Object.keys(p.scripts).join(', '));
"

echo "▶ Step 5 — gate-critical config files (deterministic, never improvised)"

# next.config.ts: OVERWRITE the trivial generated one with a known-good base. `output:
# 'standalone'` is REQUIRED by the Dockerfile (it copies .next/standalone) — making it
# deterministic here means the container build can't silently break. Security headers
# included. reactCompiler / typedRoutes are version-sensitive, so Claude adds them later
# (Step 6) after checking the installed Next version against the freshness rule.
cat >next.config.ts <<'EOF'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // minimal server bundle for the Docker runner stage
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
EOF
echo "  • wrote next.config.ts (output: standalone + security headers)"

write_if_absent vitest.config.ts <<'EOF'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Vitest runs unit + architecture tests ONLY. Playwright owns tests/e2e &
    // tests/visual; k6 owns tests/load — exclude them or Vitest tries to run them
    // and crashes on the Playwright/k6 globals.
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**', 'tests/visual/**', 'tests/load/**'],
    // env.ts validates NEXT_PUBLIC_* at import — provide them so api-client imports
    // don't throw "Invalid environment variables" in jsdom.
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:8000' },
    coverage: {
      provider: 'v8',
      // Scope coverage to the layers the rules actually govern (utils/hooks/features/
      // components). lib/store/app/instrumentation/types are infra — not gated — so
      // they don't drag the gate below threshold for being untested.
      include: [
        'src/utils/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/features/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
      ],
      exclude: ['src/components/ui/**', 'src/components/providers.tsx', 'src/**/*.d.ts'],
      // Per-layer thresholds — these MATCH .claude/rules/testing.md and the PR
      // template. The flat block is the global floor; the glob blocks raise
      // specific layers. A breach fails `vitest run --coverage` (and therefore CI).
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
        'src/utils/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/hooks/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        'src/features/**': { lines: 70, functions: 70, branches: 70, statements: 70 },
        'src/components/**': { lines: 70, functions: 70, branches: 70, statements: 70 },
      },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
EOF

write_if_absent playwright.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
EOF

write_if_absent tests/setup.ts <<'EOF'
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
EOF

echo "▶ Step 6 — gate-critical test artifacts (the gate references these — ship them real)"

write_if_absent tests/architecture/layers.test.ts <<'EOF'
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Layer import rules. A layer must NOT import from any of its "forbidden" layers.
// Aliases are matched as `@/<layer>` and bare `app/` imports. This is the structural
// backstop to the ESLint no-restricted-imports rules (defence in depth: ESLint runs
// per-file with config that can be disabled; this test reads the raw import graph).
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
    // Supports both app-router layouts (src/app with --src-dir, or top-level app/).
    const pages = [...walk('src/app'), ...walk('app')].filter((f) => f.endsWith('page.tsx'))
    const violations = pages.filter((f) =>
      importsOf(f).some((imp) => imp.startsWith('@/hooks')),
    )
    expect(violations, violations.join('\n')).toHaveLength(0)
  })
})
EOF

write_if_absent tests/e2e/helpers/auth.ts <<'EOF'
import { type Page, expect } from '@playwright/test'

// Logs a user in through the real login form and waits for the post-login redirect.
// Adjust selectors / destination to match your app's auth flow. Used by the
// REQUIRED cross-user isolation test (tests/e2e/isolation.spec.ts).
export async function loginAs(page: Page, email: string, password = 'password123') {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}
EOF

write_if_absent tests/e2e/isolation.spec.ts <<'EOF'
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

// The single most important security test: confirm User B cannot reach User A's
// resource, and that the app reveals 404 (not 403 — a 403 leaks that it exists).
// Add one of these per user-owned resource type. The backend enforces isolation via
// `userId in WHERE`; this proves the frontend surfaces it correctly.
//
// SKIPPED BY DEFAULT: a fresh scaffold has no /login flow or backend, so this would
// fail CI on day one. Change `test.skip` → `test` (and wire helpers/auth.ts) the moment
// you ship your first user-owned resource. The PR template makes that a DoD item.
test.skip('User B cannot access User A resource (404, not 403, not the data)', async ({ page }) => {
  await loginAs(page, 'usera@example.com')
  await page.getByRole('button', { name: 'New Application' }).click()
  await page.getByLabel('Company').fill('Acme Corp')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/applications\/[\w-]+$/)
  const url = page.url()

  await loginAs(page, 'userb@example.com')
  const res = await page.goto(url)

  expect(res?.status()).toBe(404)
  await expect(page.getByText('Acme Corp')).toHaveCount(0)
  await expect(page.getByText(/not found/i)).toBeVisible()
})
EOF

# k6 load scripts — pure, app-independent; driven by .github/workflows/load-test.yml.
# All three share the same request shape and differ only in load profile.
write_if_absent tests/load/smoke.js <<'EOF'
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

// Smoke: minimal load — proves the deploy is up and within budget at all.
export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
}

const params = AUTH_TOKEN ? { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } } : {}

export default function () {
  const res = http.get(`${BASE_URL}/`, params)
  check(res, { 'status is 200': (r) => r.status === 200 })
  sleep(1)
}
EOF

write_if_absent tests/load/stress.js <<'EOF'
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

// Stress: ramp to find the breaking point. Looser failure budget than smoke.
export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
}

const params = AUTH_TOKEN ? { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } } : {}

export default function () {
  const res = http.get(`${BASE_URL}/`, params)
  check(res, { 'status is 200': (r) => r.status === 200 })
  sleep(1)
}
EOF

write_if_absent tests/load/soak.js <<'EOF'
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

// Soak: sustained moderate load for an hour — surfaces memory leaks / slow drift.
export const options = {
  stages: [
    { duration: '2m', target: 30 },
    { duration: '56m', target: 30 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
  },
}

const params = AUTH_TOKEN ? { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } } : {}

export default function () {
  const res = http.get(`${BASE_URL}/`, params)
  check(res, { 'status is 200': (r) => r.status === 200 })
  sleep(1)
}
EOF

echo "▶ Step 7 — observability + contract glue (logger, api-error, error boundary, instrumentation)"

write_if_absent src/lib/api-error.ts <<'EOF'
// src/lib/api-error.ts
// Normalises backend errors into a typed ApiError so hooks NEVER discard the backend
// code/message for a hard-coded string. Reads the canonical error envelope
// { error: { code, message, details? } } and falls back for a bare FastAPI { detail }
// or an opaque error. See .claude/rules/api-contract.md (Canonical Wire Contract).
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function toApiError(error: unknown, fallback = 'Request failed'): ApiError {
  const e = error as
    | { error?: { code?: string; message?: string; details?: unknown }; detail?: unknown }
    | undefined
  if (e?.error?.message) return new ApiError(e.error.code ?? 'unknown', e.error.message, e.error.details)
  if (typeof e?.detail === 'string') return new ApiError('unknown', e.detail)
  return new ApiError('unknown', fallback)
}
EOF

write_if_absent src/lib/logger.ts <<'EOF'
// src/lib/logger.ts
// Zero-dependency structured logger for the frontend. Emits single-line JSON so logs
// are greppable in the browser console AND parseable when captured by a runtime/edge
// collector. This is the ONLY sanctioned logging path — raw console.log is flagged by
// .claude/hooks/post-write.sh. Swap `emit` for a transport (Sentry, OTel logs) later.

type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

// NODE_ENV is a build-time constant Next inlines — the one process.env read allowed
// outside env.ts (the validated NEXT_PUBLIC boundary).
function threshold(): number {
  return process.env.NODE_ENV === 'production' ? ORDER.info : ORDER.debug
}

function emit(level: Level, msg: string, fields?: Fields) {
  if (ORDER[level] < threshold()) return
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit('debug', msg, fields),
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
}
EOF

write_if_absent src/instrumentation.ts <<'EOF'
// src/instrumentation.ts
// Next.js instrumentation hook — runs once when the server process boots. This is the
// seam for wiring OpenTelemetry / a trace exporter later; for now it emits a structured
// boot log so deploys are observable.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  const { logger } = await import('@/lib/logger')
  logger.info('app.boot', { runtime: process.env.NEXT_RUNTIME ?? 'nodejs' })
}
EOF

write_if_absent src/app/global-error.tsx <<'EOF'
'use client' // Client: error boundaries must be client components

// src/app/global-error.tsx
// Catches render errors that escape the route tree and reports them through the
// structured logger. Replace the logger.error call with your error-tracking SDK
// (Sentry, etc.) when one is wired. global-error replaces the root layout, so it
// must render its own <html>/<body>.
import { useEffect } from 'react'
import { logger } from '@/lib/logger'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('unhandled.render_error', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <html lang="en">
      <body>
        <div role="alert" style={{ padding: '2rem', fontFamily: 'system-ui' }}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. The team has been notified.</p>
          <button onClick={() => reset()}>Try again</button>
        </div>
      </body>
    </html>
  )
}
EOF

write_if_absent .env.example <<'EOF'
# Public base URL of the backend API (validated in src/lib/env.ts).
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF

echo "▶ Step 8 — activate husky (pre-commit hook is committed at .husky/pre-commit)"
npm run prepare

echo "▶ Step 8b — format the scaffold so the first gate run is clean"
# create-next-app emits double-quote/semicolon code; the harness Prettier config differs.
# Format now so `npm run format:check` (in the gate/CI) passes without a manual pass.
npm run format >/dev/null 2>&1 || echo "  ⚠ prettier format skipped (non-fatal)"

echo "▶ Step 9 — commit the lockfile for reproducible installs"
# `npm install` above generated package-lock.json. Committing it (with `npm ci` in CI)
# is what makes scaffolds reproducible despite the no-pins policy. Dependabot then
# proposes reviewed bumps. (Actual commit happens in the skill's Commit step.)
if [[ ! -f package-lock.json ]]; then
  echo "  ⚠ no package-lock.json found — expected after npm install. Check npm version."
fi

echo "✅ Deterministic infra complete."
echo "   Configs, gate tests, load tests, and observability glue are written."
echo "   Next: Claude authors the remaining glue (Step 5 of the skill) — env.ts,"
echo "   api-client.ts, utils, store, providers, mocks, and ADR-000."
