// lib/pipeline.test.mjs — run: node lib/pipeline.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline, pipelineLine } from './pipeline.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const tpl = (s) => join(HERE, '..', 'templates', s)

// every real template: starts at the first stage, includes design BEFORE plan, ends at build-layer
for (const s of ['express', 'fastapi', 'nextjs', 'nestjs']) {
  const p = pipeline(tpl(s))
  assert.equal(p.at(-1), '/build-layer', `${s}: must end at /build-layer`)
  assert.ok(p.includes('/write-design'), `${s}: /write-design missing from the pipeline`)
  assert.ok(p.indexOf('/write-design') < p.indexOf('/write-plan'), `${s}: design must come before plan`)
  assert.ok(!p.includes('/infra-setup'), `${s}: setup is printed separately`)
  assert.ok(!p.includes('/validate-layer'), `${s}: nothing after build-layer is the pipeline`)
}
assert.deepEqual(pipeline(tpl('express')), ['/write-roadmap', '/write-spec', '/write-design', '/write-plan', '/build-layer'])
assert.deepEqual(pipeline(tpl('nestjs')), ['/write-spec', '/write-design', '/write-plan', '/build-layer'], 'nestjs has no roadmap skill')
assert.match(pipelineLine(tpl('express')), /\/write-spec \(\+ \/grill\) → \/write-design/)

// a repo with no skills yields nothing rather than a guessed line
const d = mkdtempSync(join(tmpdir(), 'pipe-'))
assert.deepEqual(pipeline(d), [])
mkdirSync(join(d, '.claude', 'skills', 'curate'), { recursive: true })
assert.deepEqual(pipeline(d), [], 'unnumbered skills are not pipeline stages')
rmSync(d, { recursive: true, force: true })
console.log('pipeline: all assertions passed')
