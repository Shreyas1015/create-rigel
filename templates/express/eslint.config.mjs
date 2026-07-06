import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import boundaries from 'eslint-plugin-boundaries'

// Layer import boundaries — the mechanical enforcement of ARCHITECTURE.md.
// eslint-plugin-boundaries v6: the rule is `boundaries/dependencies` (the old
// `element-types` is deprecated), selectors are object-based, element patterns are
// folder globs (`src/<layer>/**`), and the TypeScript import resolver is REQUIRED so
// the project's `.js`-extension ESM specifiers resolve to their .ts files — without
// it, boundaries classifies nothing and silently enforces nothing.
const LAYER_ELEMENTS = [
  { type: 'types', pattern: 'src/types/**' },
  { type: 'config', pattern: 'src/config/**' },
  { type: 'models', pattern: 'src/models/**' },
  { type: 'repo', pattern: 'src/repo/**' },
  { type: 'services', pattern: 'src/services/**' },
  { type: 'runtime', pattern: 'src/runtime/**' },
  { type: 'providers', pattern: 'src/providers/**' },
  { type: 'utils', pattern: 'src/utils/**' },
]

// Allowed dependencies per layer (mirrors ARCHITECTURE.md "Allowed Imports").
// `config` and `utils` are cross-cutting; `providers` is wired in by `runtime` only.
// Each layer lists itself so intra-layer imports stay legal (barrels, logger->env,
// featureFlags->redis). Anything not allowed is rejected (default: disallow).
const DEP_RULES = [
  { from: { type: 'types' }, allow: { to: { type: ['types'] } } },
  { from: { type: 'utils' }, allow: { to: { type: ['types', 'utils'] } } },
  { from: { type: 'config' }, allow: { to: { type: ['types', 'utils', 'config'] } } },
  { from: { type: 'models' }, allow: { to: { type: ['types', 'config', 'utils', 'models'] } } },
  { from: { type: 'repo' }, allow: { to: { type: ['types', 'config', 'models', 'utils', 'repo'] } } },
  { from: { type: 'services' }, allow: { to: { type: ['types', 'config', 'repo', 'utils', 'services'] } } },
  { from: { type: 'providers' }, allow: { to: { type: ['types', 'config', 'utils', 'providers'] } } },
  {
    from: { type: 'runtime' },
    allow: { to: { type: ['types', 'config', 'repo', 'services', 'providers', 'utils', 'runtime'] } },
  },
]

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      boundaries,
    },
    settings: {
      'boundaries/elements': LAYER_ELEMENTS,
      // Required so boundaries resolves the repo's `.js`-extension ESM imports to .ts files.
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // Custom rule: block process.env outside config
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="process"][property.name="env"]',
          message: 'Use env from src/config/env.ts instead of process.env directly',
        },
      ],
      // Mechanical layer-boundary enforcement (v6 rule + object selectors).
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: DEP_RULES,
        },
      ],
    },
  },
  {
    files: ['src/config/env.ts'],
    rules: {
      'no-restricted-syntax': 'off', // env.ts is allowed to use process.env
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off', // tests can use console for debugging
      '@typescript-eslint/no-explicit-any': 'off', // tests can use any for mocks
    },
  },
]
