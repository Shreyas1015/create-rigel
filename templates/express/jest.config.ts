import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  // DB-backed suites (integration + acceptance) share ONE Postgres and reset it (sync/truncate);
  // run serially so parallel workers can't wipe each other's rows mid-test.
  maxWorkers: 1,
  // The app owns a module-singleton ioredis client that supertest-based suites can't close;
  // force-exit after the run completes so those open handles don't hang the process at teardown.
  forceExit: true,
  // Provision the DB schema once, before any suite, so acceptance tests (and `ac:vector` /
  // `redgreen:record`, which run only the acceptance dir) hit a real schema without out-of-band
  // table creation. Best-effort + guarded: a no-op when no migrations exist yet or no DB is
  // reachable, so the DB-free arch-test gate (`npm run test:arch`) is unaffected.
  globalSetup: '<rootDir>/tests/setup/provision-schema.mjs',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/runtime/server.ts',
    '!src/providers/telemetry.ts', // boot-only OTel SDK wiring, like server.ts
    // Optional scaffold providers shipped by /infra-setup but not exercised until a feature
    // adopts them — excluded so their unused branches don't sink the providers/ threshold on
    // the first feature. Delete the matching line here once a feature starts using one.
    '!src/providers/auth/rbac.ts', // role guard — used once a feature needs RBAC
    '!src/providers/featureFlags.ts', // flag reader — used once a feature adds a flag
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    './src/utils/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/services/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/repo/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/runtime/routes/': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
    './src/providers/': {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}

export default config
