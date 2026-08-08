// lib/install.test.mjs — run: node lib/install.test.mjs
// The placement policy is the thing standing between a user's repo and data loss, so every branch
// is pinned here, including the one that made the bug possible (fs.cp's force default).
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { planInstall, install, summarizeInstall } from './install.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'inst-'))
const w = (root, p, body) => {
  mkdirSync(join(root, dirname(p)), { recursive: true })
  writeFileSync(join(root, p), body)
}
const read = (root, p) => readFileSync(join(root, p), 'utf8')

// ── the premise: fs.cp really does clobber by default on this Node ──
// If this ever stops being true the bug is gone, but so is the reason for this module's shape —
// so assert it rather than cite the docs.
{
  const a = mk(), b = mk()
  writeFileSync(join(a, 'f'), 'THEIRS')
  writeFileSync(join(b, 'f'), 'MINE')
  cpSync(a, b, { recursive: true })
  assert.equal(readFileSync(join(b, 'f'), 'utf8'), 'THEIRS', 'fs.cp defaults to force:true (overwrite)')
  rmSync(a, { recursive: true, force: true })
  rmSync(b, { recursive: true, force: true })
}

// ── greenfield: every path absent → everything added, nothing declined ──
{
  const src = mk(), dest = mk()
  w(src, 'a.txt', '1')
  w(src, 'nested/b.txt', '2')
  const plan = planInstall(src, dest)
  assert.deepEqual(plan.added, ['a.txt', 'nested/b.txt'])
  assert.deepEqual(plan.declined, [])
  assert.deepEqual(plan.identical, [])

  const owned = await install(src, dest, plan)
  assert.deepEqual(owned, ['a.txt', 'nested/b.txt'], 'a greenfield scaffold owns everything it wrote')
  assert.equal(read(dest, 'nested/b.txt'), '2')
  rmSync(src, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── the bug this module exists to kill: a differing file is DECLINED, not overwritten ──
{
  const src = mk(), dest = mk()
  w(src, '.gitignore', 'node_modules/\n')
  w(dest, '.gitignore', 'node_modules\nMY-SECRET-IGNORE\n')

  const plan = planInstall(src, dest)
  assert.deepEqual(plan.declined, ['.gitignore'])
  assert.deepEqual(plan.added, [])

  const owned = await install(src, dest, plan)
  assert.equal(read(dest, '.gitignore'), 'node_modules\nMY-SECRET-IGNORE\n', 'the user file is untouched')
  assert.ok(!owned.includes('.gitignore'), 'Rigel must not claim a file it declined to write')
  rmSync(src, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── byte-identical is not a collision: claim it, but do not rewrite it ──
{
  const src = mk(), dest = mk()
  w(src, 'same.txt', 'identical')
  w(dest, 'same.txt', 'identical')
  const plan = planInstall(src, dest)
  assert.deepEqual(plan.identical, ['same.txt'])
  assert.deepEqual(plan.declined, [])
  const owned = await install(src, dest, plan)
  assert.deepEqual(owned, ['same.txt'], 'we would have written exactly this, so owning it is honest')
  rmSync(src, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── mixed repo: the three outcomes coexist and only `added` is written ──
{
  const src = mk(), dest = mk()
  w(src, 'new.txt', 'new')
  w(src, 'same.txt', 'x')
  w(src, 'mine.txt', 'theirs')
  w(dest, 'same.txt', 'x')
  w(dest, 'mine.txt', 'MINE')
  w(dest, 'untouched-by-rigel.txt', 'user only')

  const plan = planInstall(src, dest)
  assert.deepEqual(plan, { added: ['new.txt'], identical: ['same.txt'], declined: ['mine.txt'] })
  const owned = await install(src, dest, plan)
  assert.deepEqual(owned, ['new.txt', 'same.txt'])
  assert.equal(read(dest, 'mine.txt'), 'MINE')
  assert.equal(read(dest, 'untouched-by-rigel.txt'), 'user only', 'files Rigel never ships are irrelevant to it')
  rmSync(src, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── install() must refuse to write over a file that appeared after planning ──
// (the plan and the disk disagreeing is an error, never a silent skip and never a clobber)
{
  const src = mk(), dest = mk()
  w(src, 'race.txt', 'theirs')
  const plan = planInstall(src, dest)
  assert.deepEqual(plan.added, ['race.txt'])
  w(dest, 'race.txt', 'appeared after planning')
  await assert.rejects(() => install(src, dest, plan), /EEXIST/i, 'a surprise collision must throw')
  assert.equal(read(dest, 'race.txt'), 'appeared after planning', 'and must not have written')
  rmSync(src, { recursive: true, force: true })
  rmSync(dest, { recursive: true, force: true })
}

// ── the report names what was left alone, because silence would read as "nothing happened" ──
{
  const s = summarizeInstall({ added: ['a'], identical: [], declined: ['.gitignore', 'README.md'] })
  assert.match(s, /1 file\(s\) added/)
  assert.match(s, /2 left alone/)
  assert.match(s, /\.gitignore/)
  assert.match(summarizeInstall({ added: [], identical: [], declined: [] }), /^$/)
}

console.log('install: all assertions passed')
