// lib/update.test.mjs — run: node lib/update.test.mjs
// planUpdate decides whether a user's edits survive an update. A bug here destroys work that
// isn't Rigel's, so every branch is pinned here rather than trusted.
import assert from 'node:assert/strict'
import { planUpdate, managedOnly, summarize } from './update.mjs'

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

console.log('update: all assertions passed')
