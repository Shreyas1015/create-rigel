// lib/blast.test.mjs — run: node lib/blast.test.mjs
//
// The load-bearing property is the CEILING: at most `pct` of a repo's files may ever be hot, in any
// repo shape. That is what makes this safe to put in front of every edit, so it is tested against a
// deliberately hostile graph (one file imported by everything) as well as a flat one.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hotSet, assess, toRepoPath, denyMessage, DEFAULTS } from './blast.mjs'

const repo = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'blast-'))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true })
    writeFileSync(join(d, p), body)
  }
  return d
}
const imports = (...ps) => ps.map((p) => `import x from '${p}'`).join('\n')

// ── the ceiling holds when one file is imported by everything ──
{
  const files = { 'src/core.ts': 'export const x = 1' }
  for (let i = 0; i < 40; i++) files[`src/f${i}.ts`] = imports('./core')
  const d = repo(files)
  const { hot, total, cut } = hotSet(d)
  assert.equal(total, 41)
  assert.ok(hot.size <= cut, `hot ${hot.size} must not exceed ceiling ${cut}`)
  assert.ok(hot.size / total <= DEFAULTS.pct + 0.02, `hot fraction ${hot.size}/${total} exceeds pct`)
  assert.ok(hot.has('src/core.ts'), 'the universally-imported file must be hot')
  rmSync(d, { recursive: true, force: true })
}

// ── a flat repo with no coupling has NO hot files (nothing to interrupt anyone for) ──
{
  const files = {}
  for (let i = 0; i < 20; i++) files[`src/f${i}.ts`] = 'export const x = 1'
  const d = repo(files)
  const { hot } = hotSet(d)
  assert.equal(hot.size, 0, 'an uncoupled repo must never interrupt an edit')
  rmSync(d, { recursive: true, force: true })
}

// ── the floor: 2 dependents is below `floor`, so not hot even if it ranks top ──
{
  const d = repo({
    'src/a.ts': 'export const x = 1',
    'src/b.ts': imports('./a'),
    'src/c.ts': imports('./a'),
    'src/d.ts': 'export const y = 1',
  })
  const { hot } = hotSet(d)
  assert.equal(hot.size, 0, `2 dependents is below floor ${DEFAULTS.floor}`)
  rmSync(d, { recursive: true, force: true })
}

// ── assess() reports the facts a deny message needs ──
{
  const files = { 'src/core.ts': 'export const x = 1' }
  for (let i = 0; i < 10; i++) files[`src/f${i}.ts`] = imports('./core')
  const d = repo(files)
  const a = assess(d, 'src/core.ts')
  assert.equal(a.hot, true)
  assert.equal(a.count, 10)
  assert.equal(a.direct.length, 10)
  assert.equal(a.indirect, 0)

  const msg = denyMessage('src/core.ts', a)
  assert.match(msg, /imported by 10 of 11 source files/)
  assert.match(msg, /\+5 more/, 'names at most five importers; the count carries the rest')
  assert.ok(msg.split('\n').length <= 12, 'deny message must stay short — long ones cause retry loops')

  // a brand-new file nobody imports is never hot — greenfield must stay frictionless
  assert.equal(assess(d, 'src/brand-new.ts').hot, false)
  // non-source paths are out of scope entirely
  assert.equal(assess(d, 'tests/core.test.ts').hot, false)
  assert.equal(assess(d, 'README.md').hot, false)
  rmSync(d, { recursive: true, force: true })
}

// ── path normalisation ──
assert.equal(toRepoPath('/repo', '/repo/src/a.ts'), 'src/a.ts')
assert.equal(toRepoPath('/repo/', '/repo/src/a.ts'), 'src/a.ts')
assert.equal(toRepoPath('/repo', 'src/a.ts'), 'src/a.ts')
assert.equal(toRepoPath('/repo', './src/a.ts'), 'src/a.ts')
assert.equal(toRepoPath('/repo', '/elsewhere/src/a.ts'), null, 'a file outside the repo is not ours to judge')
assert.equal(toRepoPath('/repo', ''), null)
assert.equal(toRepoPath('/repo', undefined), null)

console.log('blast: all assertions passed')
