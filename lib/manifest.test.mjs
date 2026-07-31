// lib/manifest.test.mjs — run: node lib/manifest.test.mjs
// The glob matcher and the ownership classifier decide what Rigel may overwrite in someone's repo.
// A bug here silently clobbers user code, so these are unit-tested rather than trusted.
import assert from 'node:assert/strict'
import { globToRegExp, matchesAny, classify, resolveOwnership, MANIFEST_PATH } from './manifest.mjs'

// ── glob semantics ──
{
  const m = (g, p) => globToRegExp(g).test(p)

  // `*` does NOT cross a separator
  assert.equal(m('docs/*.md', 'docs/git-workflow.md'), true)
  assert.equal(m('docs/*.md', 'docs/design-docs/memory.md'), false, '* must not cross /')

  // `**` does
  assert.equal(m('.claude/**', '.claude/CLAUDE.md'), true)
  assert.equal(m('.claude/**', '.claude/skills/curate/SKILL.md'), true)
  assert.equal(m('src/**', 'srcx/a.ts'), false)

  // `**/` also matches zero directories
  assert.equal(m('docs/**/*.md', 'docs/a.md'), true)
  assert.equal(m('docs/**/*.md', 'docs/x/y/a.md'), true)

  // literals are literal — dots are not wildcards
  assert.equal(m('Makefile', 'Makefile'), true)
  assert.equal(m('.prettierrc', 'xprettierrc'), false, 'dot must be escaped')
  assert.equal(m('.rigel/git-policy.json', '.rigel/git-policyxjson'), false)
}

// ── merging common + stack ──
{
  const table = {
    common: { managed: ['.claude/**'], seed: ['README.md'], user: ['src/**'] },
    express: { seed: ['package.json'], user: ['db/migrations/**'] },
  }
  const o = resolveOwnership(table, 'express')
  assert.deepEqual(o.managed, ['.claude/**'])
  assert.deepEqual(o.seed, ['README.md', 'package.json'])
  assert.deepEqual(o.user, ['src/**', 'db/migrations/**'])

  // an unknown stack still gets the common contract
  assert.deepEqual(resolveOwnership(table, 'nope').seed, ['README.md'])
}

// ── classification precedence + the manifest special case ──
{
  const o = {
    managed: ['.claude/**', 'scripts/**'],
    seed: ['README.md', 'docs/*.md'],
    user: ['src/**', 'docs/product-specs/**'],
  }
  assert.equal(classify('.claude/CLAUDE.md', o), 'managed')
  assert.equal(classify('src/index.ts', o), 'user')
  assert.equal(classify('README.md', o), 'seed')
  assert.equal(classify('docs/product-specs/SPEC-001.md', o), 'user', 'user beats seed glob overlap')

  // the manifest is the record, not its own subject — it can never contain its own hash
  assert.equal(classify(MANIFEST_PATH, o), 'manifest')

  // update sidecars are debris, never managed: the gate requires deleting them, so recording one
  // would make that deletion fail verify as "missing" — a deadlock (found by running the loop)
  assert.equal(classify('.claude/rules/testing.md.rigel-new', o), 'debris')

  // unknown paths are reported, never silently assumed owned
  assert.equal(classify('some/random/file.txt', o), null)
}

// ── matchesAny tolerates a missing bucket ──
{
  assert.equal(matchesAny('a.md', undefined), false)
  assert.equal(matchesAny('a.md', []), false)
}

console.log('manifest: all assertions passed')
