#!/usr/bin/env bash
# .claude/scripts/infra-setup.sh
# Deterministic POST-SCAFFOLD setup: deps + shadcn + dirs + package.json scripts +
# gate-critical config/test/observability files + git hooks.
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
npm install -D prettier prettier-plugin-tailwindcss eslint-config-prettier lint-staged
# Core Web Vitals budget (config/workflows committed in the template)
npm install -D @lhci/cli

echo "▶ Step 2 — shadcn/ui init + base components (non-interactive)"
npx shadcn@latest init -d
npx shadcn@latest add -y button input label form card dialog sonner badge skeleton

echo "▶ Step 3 — directory structure"
mkdir -p \
  src/types src/lib src/hooks src/store src/features src/components/shared src/utils \
  tests/unit/hooks tests/unit/features tests/unit/components tests/unit/utils \
  tests/e2e tests/e2e/helpers tests/visual tests/architecture tests/acceptance tests/design tests/load tests/mocks tests/utils \
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
  'test:design': 'playwright test tests/design/', // AC-6 deterministic design-token conformance
  'typecheck': 'tsc --noEmit',
  'lint': 'eslint .',
  'lint:fix': 'eslint . --fix',
  'format': 'prettier --write .',
  'format:check': 'prettier --check .',
  'gate': 'npm run typecheck && npm run lint && npm run format:check && npm run test:coverage',
  // Deterministic evals (PLAN-003). The per-layer 'gate' already runs the STATIC
  // traceability + assertion-integrity arch tests (test:coverage → vitest includes
  // tests/architecture/). These add the red-green recorder and the feature-completion
  // AC vector; 'gate:final' is the whole-feature check /garbage-collect runs.
  'redgreen:record': 'node scripts/redgreen-record.mjs',
  'ac:vector': 'node scripts/ac-vector.mjs',
  'gate:final': 'npm run gate && npm run ac:vector',
  'analyze': 'ANALYZE=true next build',
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
    // and crashes on the Playwright/k6 globals. tests/acceptance/ is the HOLDOUT
    // (PLAN-003): it is legitimately RED mid-build, so it is excluded here or every
    // per-layer gate would fail — it is run on demand via vitest.acceptance.config.ts
    // by scripts/redgreen-record.mjs and scripts/ac-vector.mjs.
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      ...configDefaults.exclude,
      'tests/e2e/**',
      'tests/visual/**',
      'tests/design/**',
      'tests/load/**',
      'tests/acceptance/**',
    ],
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

# Dedicated config for the acceptance HOLDOUT (PLAN-003). The main vitest.config.ts
# EXCLUDES tests/acceptance/ (it is red mid-build); this config RE-INCLUDES only that
# dir so scripts/redgreen-record.mjs + scripts/ac-vector.mjs (and the nightly Stryker
# run) can execute it on demand: `vitest run <dir> --config vitest.acceptance.config.ts`.
# It mirrors the main test env (jsdom + react + setup + alias) but carries no coverage.
write_if_absent vitest.acceptance.config.ts <<'EOF'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // ONLY the acceptance holdout. NOTE: config `exclude` blocks even an explicitly
    // named dir, so the acceptance dir must not be excluded here (that is exactly why
    // this is a separate config from vitest.config.ts).
    include: ['tests/acceptance/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:8000' },
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

# ── PLAN-003 deterministic-eval arch tests (STATIC half) — run in the per-layer gate ──
# These run inside `npm run test:coverage` (vitest includes tests/architecture/), so the
# gate enforces the structural AC invariants on every layer. The green PASS/FAIL vector
# is a feature-completion check (scripts/ac-vector.mjs), NOT these tests.

write_if_absent tests/architecture/traceability.test.ts <<'EOF'
/**
 * Architecture test — AC↔test traceability (AC-1, static half) + red-green integrity
 * (AC-4). Runs in the per-layer gate via vitest (tests/architecture/).
 *
 * This enforces the *structural* invariants that must hold from spec-time onward and
 * are safe to check on every gate (they do NOT require the tests to be green yet):
 *   1. Every AC-ID in the active plan's spec has an acceptance test titled with it.
 *   2. Every such AC-ID has a recorded red state in .rigel/redgreen/SPEC-XXX.json.
 *
 * The green PASS/FAIL vector is a feature-completion check (scripts/ac-vector.mjs),
 * not this file — acceptance tests are legitimately red mid-build.
 *
 * A fresh repo (no active plan, or a plan with no spec) skips cleanly, exactly like
 * layers.test.ts, so the suite passes immediately after /infra-setup.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const ACTIVE_DIR = 'docs/exec-plans/active'
const READY_DIR = 'docs/product-specs/ready'
const ACCEPTANCE_DIR = 'tests/acceptance'
const REDGREEN_DIR = '.rigel/redgreen'

const AC_ID = /\bAC-\d+\b/g

function firstActivePlan(): string | null {
  if (!existsSync(ACTIVE_DIR)) return null
  const plans = readdirSync(ACTIVE_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
  return plans.length ? join(ACTIVE_DIR, plans[0]!) : null
}

function specIdsFromPlan(text: string): string[] {
  const line = text.match(/\*\*Spec:\*\*\s*(.+)/)
  const source = line ? line[1]! : text
  return [...new Set([...source.matchAll(/\bSPEC-\d+\b/g)].map((m) => m[0]))]
}

function findSpecFile(specId: string): string | null {
  if (!existsSync(READY_DIR)) return null
  const hit = readdirSync(READY_DIR).find((f) => f.startsWith(specId) && f.endsWith('.md'))
  return hit ? join(READY_DIR, hit) : null
}

function acIdsInSpec(specText: string): string[] {
  const lines = specText.split('\n')
  const start = lines.findIndex((l) => /^##\s+Acceptance Criteria/i.test(l))
  if (start === -1) return []
  const ids = new Set<string>()
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) break
    for (const m of lines[i]!.matchAll(AC_ID)) ids.add(m[0])
  }
  return [...ids]
}

function testFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...testFiles(full))
    else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

function acIdsWithTests(specId: string): Set<string> {
  const found = new Set<string>()
  for (const file of testFiles(join(ACCEPTANCE_DIR, specId))) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/\b(?:describe|it|test)\s*\(\s*[`'"]([^`'"]*)[`'"]/g)) {
      for (const ac of m[1]!.matchAll(AC_ID)) found.add(ac[0])
    }
  }
  return found
}

function readRedGreen(specId: string): { tests?: Record<string, unknown> } | null {
  const f = join(REDGREEN_DIR, `${specId}.json`)
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { tests?: Record<string, unknown> }) : null
}

const plan = firstActivePlan()
const specId = plan ? specIdsFromPlan(readFileSync(plan, 'utf8'))[0] : undefined
const specFile = specId ? findSpecFile(specId) : null
const acs = specFile ? acIdsInSpec(readFileSync(specFile, 'utf8')) : []

describe('architecture: AC traceability + red-green integrity', () => {
  it('has an active plan and spec, or skips cleanly on a fresh repo', () => {
    // Sanity anchor so the suite is never empty; real assertions are conditional below.
    expect(Array.isArray(acs)).toBe(true)
  })

  const maybe = acs.length ? it : it.skip

  maybe('every spec AC-ID has an acceptance test titled with it (no MISSING)', () => {
    const withTests = acIdsWithTests(specId!)
    const missing = acs.filter((id) => !withTests.has(id))
    expect(missing).toEqual([])
  })

  maybe('every spec AC-ID has a recorded red state (no INVALID)', () => {
    const rg = readRedGreen(specId!)
    const invalid = acs.filter((id) => !rg || !rg.tests || !(id in rg.tests))
    expect(invalid).toEqual([])
  })
})
EOF

write_if_absent tests/architecture/assertion-integrity.test.ts <<'EOF'
/**
 * Architecture test — assertion integrity (AC-5). Runs in the per-layer gate via vitest
 * (tests/architecture/).
 *
 * A test that claims an AC-ID must actually assert something. Using the TypeScript
 * compiler API (present via create-next-app's `typescript` dev dependency — no new
 * dependency) we parse every acceptance test file and, for each `it`/`test` whose title
 * contains an AC-ID, require at least one NON-TRIVIAL assertion. The following are
 * rejected:
 *   - zero `expect(...)` calls
 *   - only trivial assertions on literals (`expect(true).toBe(true)`)
 *   - snapshot-only (`toMatchSnapshot` / `toMatchInlineSnapshot`)
 *
 * A fresh repo (no acceptance tests) skips cleanly.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, it, expect } from 'vitest'

const ACCEPTANCE_DIR = 'tests/acceptance'
const AC_ID = /\bAC-\d+\b/
const SNAPSHOT_MATCHERS = new Set(['toMatchSnapshot', 'toMatchInlineSnapshot'])
const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
])

function acceptanceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...acceptanceFiles(full))
    else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

/** The literal title string of an `it`/`test` call, or null. */
function testTitle(call: ts.CallExpression): string | null {
  const callee = call.expression
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
      ? callee.expression.text
      : null
  if (name !== 'it' && name !== 'test') return null
  const arg = call.arguments[0]
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text
  return null
}

/** The callback (last function/arrow argument) of a test call. */
function testBody(call: ts.CallExpression): ts.Node | null {
  for (let i = call.arguments.length - 1; i >= 0; i--) {
    const a = call.arguments[i]!
    if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) return a.body
  }
  return null
}

/** Walk up an `expect(...)` call to collect its chained matcher names. */
function matchersOf(expectCall: ts.Node): string[] {
  const names: string[] = []
  let cur: ts.Node | undefined = expectCall.parent
  while (cur && (ts.isPropertyAccessExpression(cur) || ts.isCallExpression(cur) || ts.isElementAccessExpression(cur))) {
    if (ts.isPropertyAccessExpression(cur)) names.push(cur.name.text)
    cur = cur.parent
  }
  return names
}

function isLiteral(node: ts.Expression | undefined): boolean {
  if (!node) return false
  if (ts.isPrefixUnaryExpression(node)) return isLiteral(node.operand) // -1, !true
  return LITERAL_KINDS.has(node.kind)
}

/** True if a test body contains at least one meaningful (non-trivial) assertion. */
function hasMeaningfulAssertion(body: ts.Node): boolean {
  let meaningful = false
  const visit = (node: ts.Node): void => {
    if (meaningful) return
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expect') {
      const argLiteral = isLiteral(node.arguments[0])
      const matchers = matchersOf(node)
      const invoked = matchers.length > 0
      const snapshotOnly = matchers.some((m) => SNAPSHOT_MATCHERS.has(m))
      if (invoked && !argLiteral && !snapshotOnly) meaningful = true
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return meaningful
}

type Offender = { file: string; title: string }

function scan(): Offender[] {
  const offenders: Offender[] = []
  for (const file of acceptanceFiles(ACCEPTANCE_DIR)) {
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const title = testTitle(node)
        if (title && AC_ID.test(title)) {
          const body = testBody(node)
          if (!body || !hasMeaningfulAssertion(body)) offenders.push({ file, title })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return offenders
}

const offenders = scan()

describe('architecture: acceptance-test assertion integrity', () => {
  it('every AC-claiming acceptance test has a non-trivial assertion', () => {
    const report = offenders.map((o) => `${o.file} :: "${o.title}"`)
    expect(report).toEqual([])
  })
})
EOF

write_if_absent tests/acceptance/.gitkeep <<'EOF'
# Holdout acceptance tests live here — one dir per spec: tests/acceptance/SPEC-XXX/
#
# These are the spec's success criteria, scaffolded by /write-spec (each test title
# carries its AC-ID) and proven red before implementation (scripts/redgreen-record.mjs).
# They are a HOLDOUT: the post-write hook blocks any edit here outside the spec phase,
# and CODEOWNERS requires a lead review. They are EXCLUDED from the default `vitest run`
# (vitest.config.ts) so their legitimately-red state never breaks the per-layer gate;
# they are run on demand via vitest.acceptance.config.ts. Frontend acceptance tests are
# usually .test.tsx (Testing Library + MSW). Do not edit acceptance tests while building.
EOF

# ── AC-6 — deterministic design-token conformance (PLAN-003) ───────────────────
# A Playwright check that reads computed styles of rendered pages and fails on any
# color/spacing/radius/font value not in the DESIGN.md token list. Mechanizes most of
# what a vision judge would do. Enforcement is per-dimension and opt-in (empty token
# list ⇒ that dimension is skipped; an all-empty block ⇒ the whole check skips).
write_if_absent DESIGN.md <<'EOF'
# DESIGN — Design System Tokens

> Minimal token list for the deterministic design-token conformance check (PLAN-003, AC-6).
> The full DESIGN.md format is Phase-2; for now this file only needs the token block below.
>
> The check (`tests/design/token-conformance.spec.ts`) reads the JSON between the markers
> and, for each route in `tests/design/routes.json`, fails if a rendered element uses a
> color / spacing / radius / font-size / font-family that is NOT in these lists.
>
> Enforcement is PER-DIMENSION and OPT-IN: a dimension is only checked when its array is
> non-empty. An empty block (the default) means the check SKIPS — fill in your system's
> tokens to turn enforcement on. Values are compared against COMPUTED styles, so use the
> resolved values your theme produces (e.g. hex/rgb for colors, integer px for lengths).
> Colors are exact-match; spacing / radii / font-sizes are integer px; font-family matches
> the first family in the stack (case-insensitive).

<!-- rigel-tokens:start -->
```json
{
  "colors": [],
  "spacing": [],
  "radii": [],
  "fontSizes": [],
  "fontFamilies": []
}
```
<!-- rigel-tokens:end -->
EOF

write_if_absent tests/design/routes.json <<'EOF'
["/"]
EOF

write_if_absent tests/design/token-conformance.mjs <<'EOF'
// tests/design/token-conformance.mjs
//
// AC-6 — pure, deterministic design-token conformance logic (no Playwright, no DOM).
// The .spec.ts collects computed styles in the browser and hands them here; keeping the
// parse/normalize/diff logic in plain Node makes it unit-testable and framework-free.
//
// Token source: DESIGN.md, in a region delimited by <!-- rigel-tokens:start/end --> that
// contains one ```json block. Each dimension is ENFORCED ONLY IF its token array is
// non-empty — so a fresh app (empty tokens) passes, and teams turn on dimensions by
// filling them in. Full DESIGN.md format is Phase-2; this is the minimal shape.

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Extract and parse the rigel-tokens JSON from DESIGN.md content. */
export function parseTokens(markdown) {
  const region = markdown.match(/<!--\s*rigel-tokens:start\s*-->([\s\S]*?)<!--\s*rigel-tokens:end\s*-->/)
  const scope = region ? region[1] : markdown
  const fence = scope.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!fence) return emptyTokens()
  let raw
  try {
    raw = JSON.parse(fence[1])
  } catch {
    return emptyTokens()
  }
  return {
    colors: (raw.colors ?? []).map(normalizeColor).filter(Boolean),
    spacing: (raw.spacing ?? []).map(toPx).filter((n) => n !== null),
    radii: (raw.radii ?? []).map(toPx).filter((n) => n !== null),
    fontSizes: (raw.fontSizes ?? []).map(toPx).filter((n) => n !== null),
    fontFamilies: (raw.fontFamilies ?? []).map((f) => String(f).trim().toLowerCase()).filter(Boolean),
  }
}

function emptyTokens() {
  return { colors: [], spacing: [], radii: [], fontSizes: [], fontFamilies: [] }
}

export function tokensAreEmpty(t) {
  return (
    !t.colors.length &&
    !t.spacing.length &&
    !t.radii.length &&
    !t.fontSizes.length &&
    !t.fontFamilies.length
  )
}

/** Normalize a color to lowercase #rrggbb, or null for transparent/none/unparseable. */
export function normalizeColor(value) {
  if (value == null) return null
  let v = String(value).trim().toLowerCase()
  if (v === '' || v === 'transparent' || v === 'none' || v === 'currentcolor' || v === 'inherit') return null
  if (HEX_RE.test(v)) {
    if (v.length === 4) v = '#' + [...v.slice(1)].map((c) => c + c).join('')
    return v
  }
  const m = v.match(/^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,/\s]+([0-9.%]+))?\s*\)$/)
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (a === 0) return null // fully transparent — not a token violation
  const hex = (n) => Math.round(parseFloat(n)).toString(16).padStart(2, '0')
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
}

/** Parse a CSS length to an integer px, or null (for 'auto'/'normal'/non-px). */
export function toPx(value) {
  if (typeof value === 'number') return Math.round(value)
  if (value == null) return null
  const v = String(value).trim()
  const m = v.match(/^(-?[0-9.]+)px$/)
  if (m) return Math.round(parseFloat(m[1]))
  if (/^-?[0-9.]+$/.test(v)) return Math.round(parseFloat(v)) // bare number token
  return null
}

/** First font family, lowercased, quotes stripped. */
export function firstFamily(value) {
  if (!value) return null
  const first = String(value).split(',')[0].trim().replace(/^["']|["']$/g, '')
  return first ? first.toLowerCase() : null
}

const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
]
const SPACING_PROPS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'columnGap',
  'rowGap',
]

/**
 * Diff collected computed styles against the tokens. `collected` is an array of
 * { route, sel, styles: {prop: value} }. Returns a list of violation strings.
 * Only dimensions with non-empty token lists are enforced.
 */
export function checkStyles(collected, tokens) {
  const colorSet = new Set(tokens.colors)
  const spacingSet = new Set(tokens.spacing)
  const radiiSet = new Set(tokens.radii)
  const fontSet = new Set(tokens.fontSizes)
  const famSet = new Set(tokens.fontFamilies)
  const violations = []
  const add = (route, sel, prop, value) => violations.push(`${route}  ${sel}  ${prop}: ${value}`)

  for (const { route, sel, styles } of collected) {
    if (colorSet.size) {
      for (const p of COLOR_PROPS) {
        const c = normalizeColor(styles[p])
        if (c && !colorSet.has(c)) add(route, sel, p, c)
      }
    }
    if (spacingSet.size) {
      for (const p of SPACING_PROPS) {
        const n = toPx(styles[p])
        if (n && !spacingSet.has(n)) add(route, sel, p, `${n}px`)
      }
    }
    if (radiiSet.size) {
      const r = toPx(styles.borderTopLeftRadius)
      if (r && !radiiSet.has(r)) add(route, sel, 'borderRadius', `${r}px`)
    }
    if (fontSet.size) {
      const f = toPx(styles.fontSize)
      if (f && !fontSet.has(f)) add(route, sel, 'fontSize', `${f}px`)
    }
    if (famSet.size) {
      const fam = firstFamily(styles.fontFamily)
      if (fam && !famSet.has(fam)) add(route, sel, 'fontFamily', fam)
    }
  }
  return violations
}

export const COLLECT_PROPS = [...COLOR_PROPS, ...SPACING_PROPS, 'borderTopLeftRadius', 'fontSize', 'fontFamily']
EOF

write_if_absent tests/design/token-conformance.spec.ts <<'EOF'
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { COLLECT_PROPS, checkStyles, parseTokens, tokensAreEmpty } from './token-conformance.mjs'

// AC-6 — deterministic design-token conformance. For each route, read the computed
// styles of every visible element and fail on any color/spacing/radius/font value not
// in the DESIGN.md token list. Skips cleanly until the rigel-tokens block is filled in.

function safeRead(path: string, fallback: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return fallback
  }
}

const tokens = parseTokens(safeRead('DESIGN.md', ''))
let routes: string[]
try {
  routes = JSON.parse(safeRead('tests/design/routes.json', '["/"]')) as string[]
} catch {
  routes = ['/']
}

test.describe('AC-6 — design-token conformance', () => {
  test.skip(
    tokensAreEmpty(tokens),
    'No design tokens defined in DESIGN.md yet (the rigel-tokens block is empty) — fill it in to enable the check.',
  )

  for (const route of routes) {
    test(`route ${route} uses only DESIGN.md tokens`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'load' })
      const collected = await page.evaluate((props: string[]) => {
        const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())
        const out: Array<{ sel: string; styles: Record<string, string> }> = []
        const els = Array.from(document.querySelectorAll('body *')).slice(0, 800)
        for (const el of els) {
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
          const styles: Record<string, string> = {}
          for (const p of props) styles[p] = cs.getPropertyValue(kebab(p))
          const cls =
            typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\s+/)[0]
              : ''
          const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls
          out.push({ sel, styles })
        }
        return out
      }, COLLECT_PROPS)

      const violations = checkStyles(
        collected.map((c) => ({ route, sel: c.sel, styles: c.styles })),
        tokens,
      )
      expect(
        violations,
        `Non-token values on ${route} (add them to DESIGN.md tokens or fix the styles):\n${violations.join('\n')}`,
      ).toEqual([])
    })
  }
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

# Stryker config (AC-7 mutation audit) — SCRIPT-WRITTEN, not committed at the repo root:
# a stray stryker.conf.json in the template would be flagged as a conflict by
# create-next-app and abort the park-and-restore scaffold. Written here so it lands after
# the app exists and is then committed with the repo. Drives .github/workflows/
# mutation-nightly.yml via the Vitest runner, judging the tests/acceptance/ holdout.
write_if_absent stryker.conf.json <<'EOF'
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "AC-7 mutation audit — a NIGHTLY ALARM, never a merge gate. Judges the acceptance-test holdout (tests/acceptance/ only) by mutating src/ and checking the acceptance tests catch the mutants. Run via .github/workflows/mutation-nightly.yml; the JSON report is post-processed by scripts/mutation-report.mjs into a per-AC score.",
  "packageManager": "npm",
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.acceptance.config.ts" },
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.{test,spec}.{ts,tsx}",
    "!src/types/api.generated.ts",
    "!src/instrumentation.ts",
    "!src/app/**",
    "!src/components/ui/**",
    "!src/components/providers.tsx"
  ],
  "reporters": ["json", "html", "clear-text", "progress"],
  "jsonReporter": { "fileName": "reports/mutation/mutation.json" },
  "htmlReporter": { "fileName": "reports/mutation/mutation.html" },
  "incremental": true,
  "incrementalFile": ".rigel/mutation/stryker-incremental.json"
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

echo "▶ Step 8 — activate git hooks (toolchain-free, committed under .githooks/)"
git config core.hooksPath .githooks
chmod +x .githooks/*

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
echo "   Deterministic evals (PLAN-003): scripts/{lib/rigel-evals,redgreen-record,ac-vector,"
echo "   mutation-report}.mjs, tests/architecture/{traceability,assertion-integrity}.test.ts,"
echo "   tests/acceptance/ holdout, vitest.acceptance.config.ts, and stryker.conf.json."
echo "   Next: Claude authors the remaining glue (Step 5 of the skill) — env.ts,"
echo "   api-client.ts, utils, store, providers, mocks, and ADR-000."
