// tests/setup/provision-schema.mjs
//
// Jest globalSetup — provisions the DB schema ONCE before any suite runs.
//
// Why: the acceptance suites (tests/acceptance/**) and the eval scripts that drive them
// (`npm run ac:vector`, `npm run redgreen:record`, which run only the acceptance dir) hit the
// real Express app + Postgres, but — unlike the integration suites — they do not import
// tests/integration/setup.ts, so nothing else creates their tables. Running the migrations here,
// before the first test file loads, means a green AC vector never depends on out-of-band table
// creation or on which suite jest happens to schedule first.
//
// This is BEST-EFFORT and GUARDED so it never breaks the DB-free arch-test gate
// (`npm run test:arch`, part of `npm run gate`):
//   - Skips entirely when there are no migrations yet (bare scaffold / pre-migration layers).
//   - Swallows failure when no DB is reachable — DB-backed suites will surface that themselves;
//     arch/unit suites don't touch the DB and keep passing.
//
// Migrations (not sync) are the schema source here so the acceptance schema matches production.
// The integration suites still reset with sequelize.sync({ force: true }) in their own setup.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

export default function globalSetup() {
  const migrationsDir = 'db/migrations'
  const hasMigrations =
    existsSync(migrationsDir) && readdirSync(migrationsDir).some((f) => f.endsWith('.cjs'))
  if (!hasMigrations) return // nothing to provision yet — keep the arch/unit gate DB-free

  try {
    execFileSync('npm', ['run', 'db:migrate'], { stdio: 'ignore' })
    // eslint-disable-next-line no-console -- test bootstrap, not app code
    console.log('[jest globalSetup] DB schema provisioned via db:migrate')
  } catch {
    // eslint-disable-next-line no-console -- test bootstrap, not app code
    console.warn(
      '[jest globalSetup] db:migrate skipped (no reachable DB) — DB-backed suites may fail',
    )
  }
}
