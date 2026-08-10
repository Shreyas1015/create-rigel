// lib/resume.test.mjs — run: node lib/resume.test.mjs
//
// This block is prepended to EVERY session, so two properties are load-bearing: it must never
// assert something the artifacts do not support, and it must degrade to silence rather than noise.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { activePlan, recurringFailures, resumeBlock } from './resume.mjs'

const mk = (files = {}) => {
  const d = mkdtempSync(join(tmpdir(), 'resume-'))
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true })
    writeFileSync(join(d, p), body)
  }
  return d
}

const PLAN = `# PLAN-042 — thing
- [x] Layer 1: Types — src/types
- [x] Layer 2: Config — src/config
- [ ] Layer 3: Models — src/models
- [ ] Layer 4: Repo — src/repo
`

// ── plan progress comes from the checkboxes /build-layer already ticks ──
{
  const d = mk({ 'docs/exec-plans/active/PLAN-042-thing.md': PLAN })
  const p = activePlan(d)
  assert.equal(p.id, 'PLAN-042')
  assert.equal(p.total, 4)
  assert.equal(p.done, 2)
  assert.match(p.next, /^Layer 3: Models/)
  assert.equal(p.extra, 0)
  rmSync(d, { recursive: true, force: true })
}

// ── a fully-ticked plan says "close it", not "next: null" ──
{
  const d = mk({ 'docs/exec-plans/active/PLAN-1.md': '- [x] Layer 1: Types\n- [x] Layer 2: Config\n' })
  assert.equal(activePlan(d).next, null)
  assert.match(resumeBlock(d), /ready to close/)
  rmSync(d, { recursive: true, force: true })
}

// ── more than one active plan is reported, not silently ignored ──
{
  const d = mk({ 'docs/exec-plans/active/PLAN-1.md': '- [ ] Layer 1: Types\n',
                 'docs/exec-plans/active/PLAN-2.md': '- [ ] Layer 1: Types\n' })
  assert.equal(activePlan(d).extra, 1)
  assert.match(resumeBlock(d), /2 plans in active/)
  rmSync(d, { recursive: true, force: true })
}

// ── no plan, no git, no failures → the block stays quiet rather than inventing structure ──
{
  const d = mk({ 'README.md': 'hi' })
  const b = resumeBlock(d)
  assert.match(b, /Active plan: none/)
  assert.ok(!/Recurring gate failures/.test(b), 'must not print an empty failures section')
  rmSync(d, { recursive: true, force: true })
}

// ── failures group by signature and are labelled RECURRING, never "open" ──
{
  const lines = [
    { signature: 'tsc:TS2345', message: 'a', plan: 'PLAN-001' },
    { signature: 'tsc:TS2345', message: 'b', plan: 'PLAN-002' },
    { signature: 'tsc:TS2345', message: 'c', plan: 'PLAN-002' },
    { signature: 'arch:file-too-long', message: 'd', plan: 'PLAN-001' },
    'THIS LINE IS NOT JSON',
  ].map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n')
  const d = mk({ '.rigel/gate-failures.jsonl': lines })
  const f = recurringFailures(d)
  assert.equal(f.length, 2, 'a corrupt line must not blank the section')
  assert.equal(f[0].signature, 'tsc:TS2345')
  assert.equal(f[0].count, 3)
  assert.equal(f[0].plans, 2)

  const b = resumeBlock(d)
  assert.match(b, /tsc:TS2345 ×3 across 2 plans/)
  assert.match(b, /not necessarily still open/, 'must not overclaim that a recorded failure is unresolved')
  assert.ok(!/\bopen failures\b/i.test(b), 'the log records no fix, so "open" is unsupported')
  rmSync(d, { recursive: true, force: true })
}

// ── the block is prepended to every session: keep it short ──
{
  const d = mk({ 'docs/exec-plans/active/PLAN-042.md': PLAN,
                 '.rigel/gate-failures.jsonl': JSON.stringify({ signature: 's:1', message: 'm' }) })
  const b = resumeBlock(d)
  assert.ok(b.split('\n').length <= 16, `resume block is ${b.split('\n').length} lines — too long for every session`)
  assert.match(b, /<session-resume derived-by="rigel">/)
  rmSync(d, { recursive: true, force: true })
}

console.log('resume: all assertions passed')

// ── porcelain parsing: the shared git() helper used to .trim(), which ate the leading space of
// " M path" and shifted the FIRST path by one character. Only the first, so it read as a typo.
{
  const { execFileSync } = await import('node:child_process')
  const d = mk({ 'a.txt': 'one', 'b.txt': 'two' })
  const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' })
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
  g('add', '-A'); g('commit', '-qm', 'init')
  writeFileSync(join(d, 'a.txt'), 'changed')     // → " M a.txt"  (unstaged: leading space)
  writeFileSync(join(d, 'c.txt'), 'new')         // → "?? c.txt"
  const { gitState } = await import('./resume.mjs')
  const s = gitState(d)
  assert.ok(s.dirty.includes('a.txt'), `first path corrupted: got ${JSON.stringify(s.dirty)}`)
  assert.ok(s.dirty.includes('c.txt'), `got ${JSON.stringify(s.dirty)}`)
  rmSync(d, { recursive: true, force: true })
}

console.log('resume: porcelain parsing verified')
