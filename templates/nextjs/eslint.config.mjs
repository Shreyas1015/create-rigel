// eslint.config.mjs — committed by the harness; OVERRIDES the create-next-app default
// (the park-and-restore in /infra-setup restores this on top of the generated one).
// This is what makes the layer-import matrix and the "no direct fetch / no process.env"
// rules MECHANICAL — `npm run lint` (= `eslint .`) fails CI on a violation, instead of
// the rules only living in prose. Mirrors .claude/rules/architecture.md.
//
// Uses the Next 16+ native flat-config imports (eslint-config-next/core-web-vitals),
// NOT the legacy FlatCompat bridge — that bridge crashes against eslint-config-next 16.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import eslintConfigPrettier from 'eslint-config-prettier'

// Direct fetch() is forbidden outside the hooks layer (call the API through a hook).
const noFetch = {
  selector: "CallExpression[callee.name='fetch']",
  message: 'Direct fetch() is forbidden here — call the API through a hook in src/hooks/.',
}
// process.env is forbidden outside src/lib/ (env.ts is the single validated boundary).
const noProcessEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'process.env is only allowed in src/lib/ — read validated env from src/lib/env.ts.',
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'next-env.d.ts',
    'src/types/api.generated.ts',
    'src/components/ui/**',
    'tests/load/**', // k6 scripts run in the k6 runtime, not linted as app code
  ]),

  // Harness-wide rules
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // The structured logger IS the sanctioned console boundary — allow all console here.
  {
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  // ── Layer import boundaries (the matrix in .claude/rules/architecture.md) ──
  // Each block's `files` glob is a distinct directory, so no file matches two
  // no-restricted-imports blocks (flat config REPLACES rules across blocks).
  {
    files: ['src/types/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/lib/*', '@/hooks/*', '@/features/*', '@/store/*', '@/components/*', '@/utils/*'] },
      ],
    },
  },
  {
    files: ['src/utils/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/lib/*', '@/hooks/*', '@/features/*', '@/store/*', '@/components/*'] },
      ],
    },
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/hooks/*', '@/features/*', '@/store/*', '@/components/*'] },
      ],
    },
  },
  {
    files: ['src/store/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/lib/*', '@/hooks/*', '@/features/*', '@/components/*'] },
      ],
    },
  },
  {
    files: ['src/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@/features/*', '@/components/*'] }],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@/lib/*', '@/hooks/*', '@/features/*', '@/store/*'] },
      ],
    },
  },

  // ── App router pages/layouts: render features, never call data hooks directly ──
  {
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx', 'app/**/page.tsx', 'app/**/layout.tsx'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['@/hooks/*', '@/store/*'] }] },
  },

  // ── no-restricted-syntax: fetch + process.env ──
  // NOTE: ESLint flat config REPLACES (does not merge) a rule's value across matching
  // config objects — last match wins. So every file that needs `no-restricted-syntax`
  // must get ALL its selectors in a SINGLE block, or earlier selectors are lost.
  //
  // Render layers (features/components/app): forbid BOTH direct fetch() AND process.env.
  {
    files: [
      'src/features/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/app/**/*.{ts,tsx}',
      'app/**/*.{ts,tsx}',
    ],
    rules: { 'no-restricted-syntax': ['error', noFetch, noProcessEnv] },
  },
  // Non-render src layers (hooks/store/utils): forbid process.env only.
  // (fetch isn't restricted in hooks — that's where the typed api-client lives.)
  {
    files: ['src/hooks/**/*.{ts,tsx}', 'src/store/**/*.{ts,tsx}', 'src/utils/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', noProcessEnv] },
  },

  // ── Tests cross layers by design — relax the boundary + console rules there ──
  {
    files: ['tests/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },

  // Prettier LAST — disable formatting rules that fight Prettier.
  eslintConfigPrettier,
])

export default eslintConfig
