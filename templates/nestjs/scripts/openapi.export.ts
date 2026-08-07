/**
 * OpenAPI exporter — the single machine-readable contract this service publishes.
 *
 * NestJS builds the document from the @ApiProperty / @ApiResponse decorators already on the
 * controllers and DTOs, so the contract is GENERATED, never hand-synced. `/api-sync` hands the
 * resulting `openapi.json` to the frontend; `scripts/contract-gate.mjs` re-runs this script and
 * fails if the committed file drifted (a stale contract makes /api-sync and the service map lie).
 *
 * Run: `npm run openapi:export`   →   writes ./openapi.json
 *
 * PREVIEW MODE is the important bit. `NestFactory.create(AppModule, { preview: true })` builds the
 * full module graph WITHOUT instantiating providers or running lifecycle hooks — so exporting the
 * contract does not open a Postgres/Redis connection. That is what lets the contract gate run in
 * `npm run gate` on a laptop with nothing booted, and in CI with no services. Do not "simplify"
 * this to a plain `NestFactory.create` unless you want the gate to require docker.
 *
 * If your app genuinely cannot build its graph in preview mode, the fallback is the live route:
 * boot the app and `curl http://localhost:3000/api/docs-json -o openapi.json` (see /api-sync) —
 * but then the freshness check needs a running server, so prefer fixing the module.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')
const OUT = resolve(repoRoot, 'openapi.json')

async function buildDocument(): Promise<Record<string, unknown>> {
  const appModulePath = resolve(repoRoot, 'src/app.module')
  // Fresh template, pre-/infra-setup: no app yet. Emit a minimal-but-valid base document so the
  // pipeline (export → commit → contract gate) is exercised from day one rather than day thirty.
  if (!existsSync(`${appModulePath}.ts`) && !existsSync(resolve(repoRoot, 'dist/app.module.js'))) {
    return {
      openapi: '3.0.0',
      info: { title: process.env.SERVICE_NAME ?? 'harness-service', version: process.env.APP_VERSION ?? '0.0.1' },
      paths: {},
    }
  }

  /* eslint-disable @typescript-eslint/no-var-requires -- resolved lazily: absent in a bare template */
  const { NestFactory } = require('@nestjs/core')
  const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger')
  const { AppModule } = require(appModulePath)
  /* eslint-enable @typescript-eslint/no-var-requires */

  // preview: true → module graph without provider instantiation. No DB, no Redis, no side effects.
  const app = await NestFactory.create(AppModule, { logger: false, preview: true, abortOnError: false })
  const config = new DocumentBuilder()
    .setTitle(process.env.SERVICE_NAME ?? 'harness-service')
    .setDescription('Generated contract. Canonical response envelope + error-code enum — see .claude/rules/api.md.')
    .setVersion(process.env.APP_VERSION ?? '0.0.1')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  await app.close()
  return document
}

buildDocument()
  .then((document) => {
    writeFileSync(OUT, `${JSON.stringify(document, null, 2)}\n`)
    const pathCount = Object.keys((document.paths as Record<string, unknown>) ?? {}).length
    // eslint-disable-next-line no-console -- build script, not app code
    console.log(`openapi: wrote ${pathCount} path(s) to openapi.json`)
  })
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console -- build script
    console.error('openapi export failed:', err)
    process.exit(1)
  })
