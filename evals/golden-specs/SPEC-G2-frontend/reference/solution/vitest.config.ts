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
