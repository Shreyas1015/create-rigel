// lib/update.test.mjs — run: node lib/update.test.mjs
// planUpdate decides whether a user's edits survive an update. A bug here destroys work that
// isn't Rigel's, so every branch is pinned here rather than trusted.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { planUpdate, managedOnly, summarize, rewriteManifest } from './update.mjs'

const B = 'base-hash'
const M = 'mine-hash'
const T = 'theirs-hash'

// ── the ~90% case: untouched files update silently ──
{
  const p = planUpdate({ recorded: { 'a.md': B }, mine: { 'a.md': B }, theirs: { 'a.md': T } })
  assert.deepEqual(p.overwrite, ['a.md'])
  assert.deepEqual(p.conflict, [])
}

// ── already current → no-op (not an overwrite) ──
{
  const p = planUpdate({ recorded: { 'a.md': B }, mine: { 'a.md': T }, theirs: { 'a.md': T } })
  assert.deepEqual(p.overwrite, [])
  assert.deepEqual(p.conflict, [])
}

// ── user edited it, upstream did NOT change → leave it alone ──
{
  const p = planUpdate({ recorded: { 'a.md': B }, mine: { 'a.md': M }, theirs: { 'a.md': B } })
  assert.deepEqual(p.drifted, ['a.md'])
  assert.deepEqual(p.overwrite, [], 'must never clobber a user edit')
}

// ── both changed → conflict, never a silent merge ──
{
  const p = planUpdate({ recorded: { 'a.md': B }, mine: { 'a.md': M }, theirs: { 'a.md': T } })
  assert.deepEqual(p.conflict, ['a.md'])
  assert.deepEqual(p.overwrite, [])
}

// ── new upstream file ──
{
  const p = planUpdate({ recorded: {}, mine: {}, theirs: { 'new.md': T } })
  assert.deepEqual(p.added, ['new.md'])
}

// ── user already created a file Rigel now ships, with different content → conflict ──
{
  const p = planUpdate({ recorded: {}, mine: { 'new.md': M }, theirs: { 'new.md': T } })
  assert.deepEqual(p.conflict, ['new.md'])
  assert.deepEqual(p.added, [], 'never overwrite a file the user already wrote')
}

// ── upstream dropped a file ──
{
  // untouched → remove it
  let p = planUpdate({ recorded: { 'old.md': B }, mine: { 'old.md': B }, theirs: {} })
  assert.deepEqual(p.removed, ['old.md'])

  // user had edited it → keep it, report it
  p = planUpdate({ recorded: { 'old.md': B }, mine: { 'old.md': M }, theirs: {} })
  assert.deepEqual(p.keptModified, ['old.md'])
  assert.deepEqual(p.removed, [], 'an edited file is never deleted')
}

// ── deletions the user made are never resurrected ──
{
  const p = planUpdate({
    recorded: { 'gone.md': B },
    mine: {},
    theirs: { 'gone.md': T },
    deletedByUser: ['gone.md'],
  })
  assert.deepEqual(p.skippedDeleted, ['gone.md'])
  assert.deepEqual(p.added, [])
  assert.deepEqual(p.overwrite, [])
}

// ── a managed file missing from disk without a deletedByUser record is still not resurrected ──
{
  const p = planUpdate({ recorded: { 'x.md': B }, mine: {}, theirs: { 'x.md': T } })
  assert.deepEqual(p.skippedDeleted, ['x.md'], 'absence is treated as deliberate, not as "restore it"')
}

// ── managedOnly respects the ownership contract ──
{
  const own = { managed: ['.claude/**'], seed: ['README.md'], user: ['src/**'] }
  const m = managedOnly({ '.claude/a.md': '1', 'README.md': '2', 'src/i.ts': '3' }, own)
  assert.deepEqual(Object.keys(m), ['.claude/a.md'])
}

// ── the summary names conflicts loudly ──
{
  const s = summarize(planUpdate({ recorded: { 'a.md': B }, mine: { 'a.md': M }, theirs: { 'a.md': T } }))
  assert.match(s, /CONFLICT/)
  assert.match(s, /a\.md/)
}

// ── a baselined file is DECLINED, never a conflict (PLAN-013) ──
// Sidecars are a fatal gate failure, so if adoption emitted one per pre-existing file every
// adopted repo would be red on day 1. There is no common base to conflict against.
{
  const p = planUpdate({
    recorded: {},
    mine: { '.gitignore': M, 'README.md': M },
    theirs: { '.gitignore': T, 'README.md': T },
    baseline: ['.gitignore'],
  })
  assert.deepEqual(p.declined, ['.gitignore'], 'adopted → declined')
  assert.deepEqual(p.conflict, ['README.md'], 'NOT adopted → still a real conflict')
  assert.deepEqual(p.added, [])
}

// ── a baselined file the user DELETED gets written, and stops being baseline ──
// This is the ratchet: the baseline can only shrink.
{
  const p = planUpdate({
    recorded: {},
    mine: {},                       // gone from disk
    theirs: { '.gitignore': T },
    baseline: ['.gitignore'],
  })
  assert.deepEqual(p.added, ['.gitignore'], 'absent → Rigel may now write it')
  assert.deepEqual(p.declined, [])
}

// ── a baselined file that now matches upstream is a no-op, not a claim ──
{
  const p = planUpdate({ recorded: {}, mine: { 'a': T }, theirs: { 'a': T }, baseline: ['a'] })
  assert.deepEqual(p.declined, [])
  assert.deepEqual(p.added, [])
  assert.deepEqual(p.conflict, [])
}

// ── rewriteManifest: ownership is authorship, NOT proximity (PLAN-013) ──
// This was untested, which is how the bug survived: it walked the disk and claimed everything
// matching a `managed` glob, so a user's own file in .github/ or scripts/ became Rigel-owned
// and gate-enforced after ONE update. Permanently, and silently.
{
  const root = mkdtempSync(join(tmpdir(), 'rw-'))
  const w = (rel, body) => {
    mkdirSync(join(root, dirname(rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  const ownership = { managed: ['scripts/**', '.github/**'], seed: ['README.md'], user: ['src/**'] }

  w('scripts/rigel-verify.mjs', 'ours, updated')   // Rigel wrote this, and this update rewrote it
  w('scripts/my-deploy.mjs', 'MINE')               // the user wrote this. managed GLOB, not ours
  w('.github/workflows/deploy.yml', 'MINE TOO')    // same
  w('README.md', 'seed — team owns it after scaffold')
  w('src/app.ts', 'user code')

  const manifest = { files: { 'scripts/rigel-verify.mjs': 'old-hash' }, ownership }
  const next = rewriteManifest({
    manifest, version: '9.9.9', root, ownership,
    written: ['scripts/rigel-verify.mjs'],
  })

  assert.deepEqual(
    Object.keys(next.files),
    ['scripts/rigel-verify.mjs'],
    'only the file Rigel actually wrote is claimed — proximity to a managed glob is not ownership',
  )
  assert.ok(!('scripts/my-deploy.mjs' in next.files), "the user's own script must never be claimed")
  assert.ok(!('.github/workflows/deploy.yml' in next.files), "nor their own workflow")
  assert.ok(!('README.md' in next.files), 'seed files stay the team\'s and are never hash-enforced')
  assert.notEqual(next.files['scripts/rigel-verify.mjs'], 'old-hash', 'a rewritten file is re-hashed')
  assert.equal(next.updatedWith, '9.9.9')

  // A second update must not accumulate anything new — the bug was permanent once it happened.
  const again = rewriteManifest({ manifest: next, version: '9.9.9', root, ownership, written: [] })
  assert.deepEqual(Object.keys(again.files), ['scripts/rigel-verify.mjs'])

  // A file Rigel owned that the user deleted drops out of the record rather than becoming "missing".
  rmSync(join(root, 'scripts/rigel-verify.mjs'))
  const after = rewriteManifest({ manifest: next, version: '9.9.9', root, ownership, written: [] })
  assert.deepEqual(Object.keys(after.files), [], 'a deleted managed file leaves the record')

  rmSync(root, { recursive: true, force: true })
}

console.log('update: all assertions passed')
