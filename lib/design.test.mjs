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

// ── PLAN-024 AC-6: a stale index must not be a false green ──────────────────────
import { corpusVersion, fingerprint, citationBasis } from './design.mjs'
import { execFileSync } from 'node:child_process'
{
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'ignore' })
  const corpus = mk({ 'hld/caching.md': '# Caching\n## Write-through\n## Write-back\n' })
  git(corpus, 'init', '-q'); git(corpus, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'a', '--allow-empty')
  git(corpus, 'add', '-A'); git(corpus, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'notes')
  const v = corpusVersion(corpus)
  assert.ok(v?.commit && v.dirty === false, 'a clean git corpus reports its commit')

  // index it the way `create-rigel design-index` does
  const proj = mk({ 'README.md': 'x' })
  const idx = buildIndex(corpus)
  const write = () => writeFileSync(join(proj, REFS_PATH), JSON.stringify({ corpus, corpusCommit: v.commit, fingerprint: fingerprint(idx.files), files: idx.files }))
  mkdirSync(join(proj, '.rigel'), { recursive: true }); write()

  // unchanged corpus → no staleness
  let b = citationBasis(proj)
  assert.equal(b.stale, null)
  assert.match(b.basis, /matching the committed index/)
  assert.equal(resolveRef(b.index, 'hld/caching.md#write-back').ok, true)

  // rename a heading in the notes → the old citation must now FAIL, and staleness is reported
  writeFileSync(join(corpus, 'hld/caching.md'), '# Caching\n## Write-through\n## Write-behind\n')
  b = citationBasis(proj)
  assert.ok(b.stale, 'a changed corpus must be reported stale')
  assert.equal(b.stale.sectionsRemoved, 1)
  assert.equal(resolveRef(b.index, 'hld/caching.md#write-back').ok, false, 'THE false green: a renamed section must not still resolve')
  assert.equal(resolveRef(b.index, 'hld/caching.md#write-behind').ok, true, 'and the new one resolves')
  assert.equal(corpusVersion(corpus).dirty, true, 'uncommitted edits are visible')

  // corpus absent (CI) → the committed index, labelled with the commit it reflects
  rmSync(corpus, { recursive: true, force: true })
  b = citationBasis(proj)
  assert.equal(b.stale, null)
  assert.match(b.basis, new RegExp(`committed index \\(notes@${v.commit}\\)`))
  assert.equal(resolveRef(b.index, 'hld/caching.md#write-back').ok, true, 'CI falls back to what was committed')

  // a non-git corpus has no commit — the fingerprint still catches the change
  const plain = mk({ 'a.md': '# A\n## One\n' })
  assert.equal(corpusVersion(plain), null)
  const f1 = fingerprint(buildIndex(plain).files)
  writeFileSync(join(plain, 'a.md'), '# A\n## Two\n')
  assert.notEqual(fingerprint(buildIndex(plain).files), f1)

  // no index at all → nothing to check, and it says so
  assert.equal(citationBasis(mk({})).basis, 'none')
  for (const d of [proj, plain]) rmSync(d, { recursive: true, force: true })
}
console.log('design: staleness assertions passed')
