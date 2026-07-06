/**
 * OpenAPI exporter — the single machine-readable contract for the harness family.
 *
 * The whole harness shares one response envelope, one error-code enum, and one
 * cursor format (see .claude/rules/api.md). This script turns the Zod schemas +
 * route registrations into an OpenAPI 3.1 document that the Next.js frontend
 * consumes via `openapi-fetch` — so the contract is generated, never hand-synced
 * across backend and frontend.
 *
 * How it works:
 *   - Routes/schemas register themselves into an OpenAPIRegistry exported from
 *     `src/runtime/openapi.ts` (created by /infra-setup; products add paths there).
 *   - This script imports that registry if it exists, generates the document, and
 *     writes docs/generated/openapi.json + openapi.yaml.
 *   - If the registry is absent (fresh template, pre-/infra-setup) it emits a
 *     minimal-but-valid base document so the pipeline + CI drift-check still work.
 *
 * Run: `npm run openapi:export`  (CI runs it and fails if the committed doc drifts).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { stringify as yamlStringify } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const OUT_DIR = resolve(repoRoot, 'docs/generated')

/**
 * Pull the product's populated registry from src/runtime/openapi.ts when present.
 * Falls back to an empty registry so the template (no src/ yet) still produces a
 * valid base document.
 */
async function loadRegistry(): Promise<OpenAPIRegistry> {
  const candidates = [
    resolve(repoRoot, 'dist/runtime/openapi.js'),
    resolve(repoRoot, 'src/runtime/openapi.ts'),
  ]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const mod = (await import(pathToFileURL(file).href)) as { registry?: OpenAPIRegistry }
    if (mod.registry) return mod.registry
  }
  return new OpenAPIRegistry()
}

async function main(): Promise<void> {
  const registry = await loadRegistry()
  const generator = new OpenApiGeneratorV31(registry.definitions)

  const document = generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: process.env.SERVICE_NAME ?? 'harness-service',
      version: process.env.APP_VERSION ?? '0.0.1',
      description:
        'Generated contract. Canonical response envelope + error-code enum are identical across the harness family — see .claude/rules/api.md.',
    },
    servers: [{ url: '/api/v1' }],
  })

  mkdirSync(OUT_DIR, { recursive: true })
  const json = `${JSON.stringify(document, null, 2)}\n`
  writeFileSync(resolve(OUT_DIR, 'openapi.json'), json)
  writeFileSync(resolve(OUT_DIR, 'openapi.yaml'), yamlStringify(document))

  const pathCount = Object.keys(document.paths ?? {}).length
  // eslint-disable-next-line no-console -- this is a build script, not app code
  console.log(`openapi: wrote ${pathCount} path(s) to docs/generated/openapi.{json,yaml}`)
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- build script
  console.error('openapi export failed:', err)
  process.exit(1)
})
