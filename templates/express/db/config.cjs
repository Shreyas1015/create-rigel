/**
 * sequelize-cli database config — CLI-shaped ({ development, test, production }).
 *
 * This is DELIBERATELY separate from src/config/database.ts:
 *   - src/config/database.ts exports the app's runtime Sequelize *instance* (ESM/TS).
 *   - sequelize-cli needs a plain config object it loads via its own importer, and this
 *     package is `"type": "module"`, so a `.js` file here would be parsed as ESM and its
 *     `module.exports` would throw "module is not defined in ES module scope". Hence `.cjs`
 *     (forced CommonJS regardless of package type). Migration files under db/migrations are
 *     `.cjs` for the same reason.
 *
 * DATABASE_URL comes from the environment; dotenv loads a local `.env` when present (in CI the
 * var is set directly, so the missing-.env case is a harmless no-op).
 */
require('dotenv').config()

const base = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  logging: false,
}

module.exports = {
  development: base,
  test: base,
  production: base,
}
