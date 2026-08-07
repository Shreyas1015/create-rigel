#!/usr/bin/env node
// scripts/contract-freshness.mjs — PLAN-010, the CONSUMER half of the contract gate.
//
// This app CONSUMES a contract; it does not publish one. So the backend templates' question
// ("did I break my consumers?" — oasdiff against origin/main) is meaningless here: nothing
// downstream depends on an artifact this repo owns. There is deliberately no breaking-change
// check and no .oasdiff-ignore in this template. Adding one would be a check that verifies
// nothing, which is worse than no check.
//
// The FRESHNESS half, though, is exactly as load-bearing here as it is on the provider side.
// `src/types/api.generated.ts` is a DERIVED artifact: openapi.json in, types out. Two failures
// make the build green against a contract the backend no longer serves —
//
//   1. someone hand-edits api.generated.ts. `/api-sync` says "NEVER edit this manually"; until
//      now nothing enforced it, and a hand-edit survives until the next codegen silently reverts
//      it (or, worse, doesn't).
//   2. openapi.json is re-vendored from the backend and codegen is not re-run. Every call site
//      then typechecks against the OLD contract and compiles clean. The failure surfaces in
//      production, as a 4xx or an undefined field.
//
// Both are "a green gate over a wrong contract" — the same class the provider-side freshness
// check kills. So: regenerate, compare, fail on drift.
//
// It regenerates to a TEMP file and compares. It never writes src/types/api.generated.ts in
// place: a gate that repairs the drift it is measuring reports a pass and leaves an uncommitted
// diff, which is how a check quietly stops checking. Fixing is `npm run api:sync` — a human's
// commit, in a reviewed diff.
//
// Usage: node scripts/contract-freshness.mjs
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SPEC = 'openapi.json'
const GENERATED = 'src/types/api.generated.ts'
const BIN = join('node_modules', '.bin', 'openapi-typescript')

if (!existsSync(SPEC)) {
  // No vendored contract yet — a fresh scaffold, or a frontend not yet wired to a backend.
  console.log(`  · no ${SPEC} yet — run /api-sync once the backend has published its contract`)
  process.exit(0)
}

if (!existsSync(BIN)) {
  // A missing devDependency is a setup problem, not a contract problem. Say so; don't fail the
  // gate for it (the same call the backend templates make when oasdiff isn't installed).
  console.log(`  · openapi-typescript not installed — contract freshness check skipped (run: npm install)`)
  process.exit(0)
}

if (!existsSync(GENERATED)) {
  console.error(`  ✗ ${SPEC} is committed but ${GENERATED} does not exist — the contract was never generated.`)
  console.error('    Run `npm run api:sync` and commit the result.')
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'rigel-contract-'))
const out = join(dir, 'api.generated.ts')
try {
  const r = spawnSync(BIN, [SPEC, '-o', out], { encoding: 'utf8' })
  if (r.status !== 0) {
    // Codegen blew up (usually: openapi.json doesn't parse). That is a TOOL/INPUT failure, NOT
    // "the types are stale" — say which, or the next person fixes the wrong thing.
    const lines = `${r.stderr || ''}\n${r.stdout || ''}`.split('\n').map((l) => l.trim()).filter(Boolean)
    const diagnosis = lines.filter((l) => /error/i.test(l)).slice(0, 2)
    console.error('  ✗ openapi-typescript could not run — a TOOL/INPUT failure, not stale types.')
    console.error(`    Usually ${SPEC} does not parse. Re-vendor it from the backend.`)
    for (const l of (diagnosis.length ? diagnosis : lines.slice(0, 2))) console.error(`      ${l}`)
    process.exit(1)
  }
  if (readFileSync(out, 'utf8') !== readFileSync(GENERATED, 'utf8')) {
    console.error(`  ✗ ${GENERATED} is STALE — it does not match ${SPEC}.`)
    console.error('    Either openapi.json was re-vendored without re-running codegen, or the generated')
    console.error('    file was hand-edited. Both compile clean against the WRONG contract.')
    console.error('    Fix: npm run api:sync   (then commit openapi.json + the generated types together)')
    process.exit(1)
  }
  console.log('  ✓ generated API types match openapi.json (regeneration produced no diff)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
