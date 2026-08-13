// lib/design.test.mjs — run: node lib/design.test.mjs
//
// The property that matters most is the one that is easy to get wrong quietly: a project with NO
// corpus must still work. If that regresses, every user who never opted in gets a broken gate.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { slug, resolveCorpus, buildIndex, loadIndex, resolveRef, search, topics, REFS_PATH } from './design.mjs'

const mk = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'design-'))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true })
    writeFileSync(join(d, p), body)
  }
  return d
}

// ── slugs match GitHub's shape, including the escaped-dot headings real notes contain ──
assert.equal(slug('Caching Fundamentals'), 'caching-fundamentals')
assert.equal(slug('## 1\\. The core idea'), '1-the-core-idea')
assert.equal(slug('TTL : Time To Live'), 'ttl-time-to-live')
assert.equal(slug('LRU vs LFU — the key trade-off'), 'lru-vs-lfu-the-key-trade-off')
assert.equal(slug('`code` and *emphasis*'), 'code-and-emphasis')

// ── index: headings only, never body text ──
{
  const c = mk({
    'hld/caching/strategies.md': '# Caching Strategies\n\nsecret body text\n\n## Write-through\ntext\n## Write-back\n',
    'hld/api/auth.md': '# Auth\n### Bearer tokens\n',
    'images/ignore.png': 'x',
    'scraper/tool.md': '# should be skipped',
  })
  const idx = buildIndex(c)
  assert.equal(idx.count, 2, 'scraper/ and non-md are skipped')
  assert.deepEqual(idx.files['hld/caching/strategies.md'], ['caching-strategies', 'write-through', 'write-back'])
  assert.ok(!JSON.stringify(idx).includes('secret body text'), 'index must never carry body text')
  assert.equal(idx.anchors, 5)
  rmSync(c, { recursive: true, force: true })
}

// ── corpus resolution order ──
{
  const corpusA = mk({ 'a.md': '# A' })
  const corpusB = mk({ 'b.md': '# B' })
  const bundled = mk({ 'z.md': '# Z' })
  const proj = mk({ [REFS_PATH]: JSON.stringify({ corpus: corpusB, files: {} }) })

  assert.deepEqual(resolveCorpus(proj, { bundled, env: { RIGEL_NOTES_PATH: corpusA } }), { path: corpusA, source: 'env' })
  assert.deepEqual(resolveCorpus(proj, { bundled, env: {} }), { path: corpusB, source: 'project' })
  assert.deepEqual(resolveCorpus(mk({}), { bundled, env: {} }), { path: bundled, source: 'bundled' })
  assert.deepEqual(resolveCorpus(mk({}), { bundled: null, env: {} }), { path: null, source: 'none' })

  // a bad env path must not win — it would mask the working fallbacks
  assert.equal(resolveCorpus(proj, { bundled, env: { RIGEL_NOTES_PATH: '/does/not/exist' } }).source, 'project')
  for (const d of [corpusA, corpusB, bundled, proj]) rmSync(d, { recursive: true, force: true })
}

// ── THE load-bearing case: no corpus, no index, nothing blows up ──
{
  const proj = mk({ 'README.md': 'hi' })
  assert.equal(loadIndex(proj), null)
  assert.deepEqual(search(null, 'caching'), [])
  assert.deepEqual(topics(null), [])
  assert.equal(resolveRef(null, 'a#b').ok, false, 'no index resolves nothing — but must not throw')
  rmSync(proj, { recursive: true, force: true })
}

// ── a malformed refs file is not mistaken for "no citations to check" ──
{
  const proj = mk({ [REFS_PATH]: '{ not json' })
  assert.equal(loadIndex(proj), null)
  rmSync(proj, { recursive: true, force: true })
}

// ── citation resolution ──
{
  const index = {
    files: {
      'hld/09-caching/04-strategies.md': ['caching-strategies', 'write-through', 'write-back'],
      'hld/05-api/03-auth.md': ['auth', 'bearer-tokens'],
    },
  }
  assert.equal(resolveRef(index, 'hld/09-caching/04-strategies.md#write-back').ok, true)
  assert.equal(resolveRef(index, 'hld/09-caching/04-strategies').ok, true, '.md is optional')
  assert.equal(resolveRef(index, 'hld/09-caching/04-strategies.md').ok, true, 'anchor is optional')
  assert.equal(resolveRef(index, '09-caching/04-strategies.md#write-back').ok, true, 'leading topic dir may be omitted')

  const bad = resolveRef(index, 'hld/09-caching/04-strategies.md#write-behind')
  assert.equal(bad.ok, false)
  assert.match(bad.reason, /no section "#write-behind"/)
  assert.equal(bad.suggestion, 'write-through', 'should suggest the nearest real anchor')

  const missing = resolveRef(index, 'hld/09-caching/99-nope.md')
  assert.equal(missing.ok, false)
  assert.match(missing.reason, /no such note/)
}

// ── search: deterministic, headings-weighted, exact match wins ──
{
  const index = {
    files: {
      'hld/09-caching/04-strategies.md': ['caching-strategies', 'write-through', 'write-back'],
      'hld/09-caching/10-stampede.md': ['cache-stampede', 'mitigations'],
      'lld/05-solid/01-srp.md': ['single-responsibility-principle'],
    },
  }
  const r = search(index, 'write-back')
  assert.equal(r[0].ref, 'hld/09-caching/04-strategies.md#write-back', 'exact heading wins')

  const s = search(index, 'cache stampede')
  assert.equal(s[0].anchor, 'cache-stampede')

  assert.deepEqual(search(index, 'write-back'), search(index, 'write-back'), 'must be deterministic')
  assert.deepEqual(search(index, 'nothing-matches-here-xyz'), [])
  assert.ok(search(index, 'caching', 2).length <= 2, 'limit is honoured')
}

// ── topics ──
{
  const index = { files: { 'hld/a.md': [], 'hld/b.md': [], 'lld/c.md': [] } }
  assert.deepEqual(topics(index), [{ name: 'hld', notes: 2 }, { name: 'lld', notes: 1 }])
}

console.log('design: all assertions passed')
