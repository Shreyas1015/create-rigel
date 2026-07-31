// lib/layer.test.mjs — run: node lib/layer.test.mjs
// Company-layer resolution: URI parsing, git fetch (against a real local repo, no network),
// overlay semantics, and ownership merging.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTemplateSpec, fetchLayer, readLayerConfig, applyLayer, mergeOwnership } from './layer.mjs'

const STACKS = ['nextjs', 'express', 'nestjs', 'fastapi']

// ── URI parsing ──
{
  assert.deepEqual(parseTemplateSpec('express', STACKS), { kind: 'builtin', stack: 'express' })
  assert.deepEqual(parseTemplateSpec(undefined, STACKS), { kind: 'builtin', stack: undefined })

  let p = parseTemplateSpec('gh:acme/rigel#a1b2c3d', STACKS)
  assert.equal(p.kind, 'git')
  assert.equal(p.url, 'https://github.com/acme/rigel.git')
  assert.equal(p.ref, 'a1b2c3d')

  assert.equal(parseTemplateSpec('github:acme/rigel', STACKS).ref, null, 'ref is optional')
  assert.equal(parseTemplateSpec('gitlab:acme/rigel', STACKS).url, 'https://gitlab.com/acme/rigel.git')
  assert.equal(parseTemplateSpec('https://git.acme.io/x.git#v2', STACKS).ref, 'v2')

  // ssh URLs contain ':' and refs may contain '/': split on the LAST '#'
  p = parseTemplateSpec('git@github.com:acme/rigel.git#release/2026-07', STACKS)
  assert.equal(p.kind, 'git')
  assert.equal(p.url, 'git@github.com:acme/rigel.git')
  assert.equal(p.ref, 'release/2026-07')

  assert.equal(parseTemplateSpec('./my-layer', STACKS).kind, 'local')
  assert.equal(parseTemplateSpec('/abs/layer', STACKS).kind, 'local')
  assert.equal(parseTemplateSpec('nonsense', STACKS).kind, 'unknown', 'a bare word is not a URI')
}

// ── ownership merging ──
{
  const base = { managed: ['.claude/**'], seed: ['README.md'], user: ['src/**'] }
  const merged = mergeOwnership(base, { managed: ['eslint-rules/**', '.claude/**'] })
  assert.deepEqual(merged.managed, ['.claude/**', 'eslint-rules/**'], 'deduped')
  assert.deepEqual(merged.seed, ['README.md'])
  assert.deepEqual(mergeOwnership(base).managed, ['.claude/**'], 'no layer ownership is fine')
}

// ── a real git fetch, pinned to a SHA, from a local repo (no network) ──
{
  const origin = mkdtempSync(join(tmpdir(), 'layer-origin-'))
  const git = (...a) => execFileSync('git', a, { cwd: origin, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 't')
  writeFileSync(join(origin, 'rigel-layer.json'), JSON.stringify({ name: 'acme', extends: 'express' }))
  mkdirSync(join(origin, 'managed'), { recursive: true })
  writeFileSync(join(origin, 'managed', 'a.md'), 'v1')
  git('add', '-A')
  git('commit', '-qm', 'v1')
  const sha1 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: origin, encoding: 'utf8' }).trim()
  writeFileSync(join(origin, 'managed', 'a.md'), 'v2')
  git('commit', '-qam', 'v2')

  // pinned to the FIRST commit — pinning is the whole point
  const dest = mkdtempSync(join(tmpdir(), 'layer-dest-'))
  const got = fetchLayer(parseTemplateSpec(`file://${origin}#${sha1}`, STACKS), dest)
  assert.equal(got.sha, sha1, 'returns the exact resolved SHA')
  assert.equal(readFileSync(join(dest, 'managed', 'a.md'), 'utf8'), 'v1', 'pinned SHA, not the tip')
  assert.equal(readLayerConfig(dest).extends, 'express')

  rmSync(origin, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── a directory without rigel-layer.json is refused ──
{
  const bogus = mkdtempSync(join(tmpdir(), 'layer-bogus-'))
  assert.throws(() => fetchLayer({ kind: 'local', path: bogus }, bogus), /not a Rigel company layer/)
  rmSync(bogus, { recursive: true, force: true })
}

// ── overlay semantics: managed always written, seed only when absent ──
{
  const layer = mkdtempSync(join(tmpdir(), 'layer-'))
  const target = mkdtempSync(join(tmpdir(), 'target-'))
  mkdirSync(join(layer, 'managed', 'deep'), { recursive: true })
  mkdirSync(join(layer, 'seed'), { recursive: true })
  writeFileSync(join(layer, 'managed', 'deep', 'rule.md'), 'layer version')
  writeFileSync(join(layer, 'seed', 'OWNED.md'), 'layer seed')

  // target already has the managed file (base template) and the seed file (team already edited it)
  mkdirSync(join(target, 'deep'), { recursive: true })
  writeFileSync(join(target, 'deep', 'rule.md'), 'base version')
  writeFileSync(join(target, 'OWNED.md'), 'team version')

  const w = await applyLayer(layer, target)
  assert.equal(readFileSync(join(target, 'deep', 'rule.md'), 'utf8'), 'layer version', 'managed overrides base')
  assert.equal(readFileSync(join(target, 'OWNED.md'), 'utf8'), 'team version', 'seed never overwrites')
  assert.deepEqual(w.managed, ['deep/rule.md'])
  assert.deepEqual(w.seed, [], 'nothing seeded — the file already existed')

  rmSync(layer, { recursive: true, force: true })
  rmSync(target, { recursive: true, force: true })
}

console.log('layer: all assertions passed')
