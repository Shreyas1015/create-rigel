// lib/doctor.test.mjs — run: node lib/doctor.test.mjs
// doctor's whole value is that it tells the truth about a repo without failing it. The two ways it
// could betray that — reporting a check as wired when it isn't, and exiting non-zero — are pinned
// here, along with the sections themselves.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { diagnose, detectState, countBad, placement, BLIND_SPOTS } from './doctor.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'doc-'))
const w = (root, rel, body) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), body)
}
const find = (r, label) => r.sections.find((s) => s.label === label)?.findings ?? []
const detailsOf = (r, label) => find(r, label).map((f) => `${f.state}:${f.detail}`).join(' | ')

// ── the four states are facts about the directory, never a question ──
{
  const empty = mk()
  assert.equal(detectState(empty), 'greenfield')

  const never = mk()
  w(never, 'package.json', '{}')
  assert.equal(detectState(never), 'never-rigel')

  const stale = mk()
  w(stale, '.rigel/git-policy.json', '{}')
  assert.equal(detectState(stale), 'stale-rigel')

  const adopted = mk()
  w(adopted, '.rigel/manifest.json', '{"files":{}}')
  assert.equal(detectState(adopted), 'adopted')

  for (const d of [empty, never, stale, adopted]) rmSync(d, { recursive: true, force: true })
}

// ── a repo with no provenance says so, and nothing throws ──
{
  const root = mk()
  w(root, 'package.json', '{"name":"x"}')
  const r = diagnose(root)
  assert.match(detailsOf(r, 'PROVENANCE'), /bad:no provenance/)
  assert.ok(countBad(r) > 0)
  rmSync(root, { recursive: true, force: true })
}

// ── an empty `files` map is a FAILURE, not "0 files intact" ──
// The verifier exits 2 on this; doctor must not describe it more kindly.
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 2, template: 'express', files: {} }))
  const r = diagnose(root)
  assert.match(detailsOf(r, 'PROVENANCE'), /bad:manifest records ZERO owned files/)
  rmSync(root, { recursive: true, force: true })
}

// ── a newer schema is refused rather than half-understood ──
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 99, template: 'express', files: { 'a': 'h' } }))
  const r = diagnose(root)
  assert.match(detailsOf(r, 'PROVENANCE'), /bad:manifest is schemaVersion 99/)
  rmSync(root, { recursive: true, force: true })
}

// ── WIRING: shipped-but-unrun is a FAILURE; absent is a different, softer finding ──
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 2, template: 'express', files: { 'x': 'h' } }))
  w(root, 'scripts/rigel-verify.mjs', '// ours')
  w(root, 'scripts/rigel-knowledge.mjs', '// ours')
  // a gate that runs only ONE of them
  w(root, 'package.json', JSON.stringify({ scripts: { gate: 'npm run verify:rigel', 'verify:rigel': 'node scripts/rigel-verify.mjs' } }))

  const d = detailsOf(diagnose(root), 'WIRING')
  assert.match(d, /ok:verify:rigel/, 'a wired check is green')
  assert.match(d, /bad:knowledge ships but NOTHING RUNS IT/, 'shipped-but-unrun is a failure')
  assert.match(d, /note:contract:gate — not present/, 'absent is a note, and says so differently')
  rmSync(root, { recursive: true, force: true })
}

// ── WIRING must never claim "wired" when it cannot tell ──
// A gate composed through npm-run-all/turbo is unparseable. Guessing ✓ there would be the exact
// false green this command exists to surface.
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 2, template: 'express', files: { 'x': 'h' } }))
  w(root, 'scripts/rigel-verify.mjs', '// ours')
  w(root, 'package.json', JSON.stringify({ scripts: { gate: 'npm-run-all --parallel lint typecheck' } }))
  const d = detailsOf(diagnose(root), 'WIRING')
  assert.match(d, /note:verify:rigel — could not determine/, 'unparseable → "could not determine", never ✓')
  assert.ok(!/ok:verify:rigel/.test(d))
  rmSync(root, { recursive: true, force: true })
}

// ── a gate that exists but is never run in CI is laptop-only enforcement (LSN-0015) ──
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 2, template: 'express', files: { 'x': 'h' } }))
  w(root, 'scripts/rigel-verify.mjs', '// ours')
  w(root, 'package.json', JSON.stringify({ scripts: { gate: 'npm run verify:rigel', 'verify:rigel': 'node scripts/rigel-verify.mjs' } }))
  w(root, '.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - run: npm run typecheck\n')
  assert.match(detailsOf(diagnose(root), 'WIRING'), /bad:CI exists but never runs the gate/)

  // ...and a comment mentioning it must not satisfy that (the check-ci-mirrors-gate lesson).
  w(root, '.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      # we should run npm run gate here\n      - run: npm run typecheck\n')
  assert.match(detailsOf(diagnose(root), 'WIRING'), /bad:CI exists but never runs the gate/, 'a comment is not a step')

  w(root, '.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - run: npm run gate\n')
  assert.match(detailsOf(diagnose(root), 'WIRING'), /ok:CI invokes the gate/)
  rmSync(root, { recursive: true, force: true })
}

// ── CONVERGENCE reports the distance as a number ──
{
  const root = mk()
  w(root, '.rigel/manifest.json', JSON.stringify({ schemaVersion: 2, template: 'express', mode: 'brownfield', files: { 'x': 'h' }, baseline: ['.gitignore', 'package.json'] }))
  w(root, 'src/controllers/orders.ts', 'export const a = 1')  // outside the enforced layers
  w(root, 'src/services/order.service.ts', 'export const b = 1') // inside
  const d = detailsOf(diagnose(root), 'CONVERGENCE')
  assert.match(d, /2 pre-existing file\(s\) Rigel does not own/)
  assert.match(d, /1 of 2 source file\(s\) are outside/)
  rmSync(root, { recursive: true, force: true })
}

// ── PLACEMENT is the preview, and it never promises a rewrite ──
{
  const f = placement({ added: ['a', 'b'], identical: [], declined: ['.gitignore'] })
  const s = f.map((x) => x.detail).join(' | ')
  assert.match(s, /2 file\(s\) would be added/)
  assert.match(s, /left alone \(yours\)/)
  assert.match(s, /additive — nothing above is rewritten/)
}

// ── the blind spots are stated, or the report implies completeness ──
{
  assert.ok(BLIND_SPOTS.length >= 4)
  assert.ok(BLIND_SPOTS.some((b) => /branch protection/i.test(b)))
}

console.log('doctor: all assertions passed')
