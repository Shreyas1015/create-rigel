// lib/syntax.test.mjs — run: node lib/syntax.test.mjs
//
// The load-bearing property is the LINE between parse and type errors. If a mid-layer file that
// merely references something not yet written gets flagged, this hook fires on ordinary work and
// gets switched off. Those cases are tested as carefully as the genuine breakage.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSyntax, report } from './syntax.mjs'

// Borrow a real typescript install so the TS path is exercised, not stubbed.
const TS_SRC = '/Users/shreyasss15/Projects-Clean/shreyas/rigel-bookmarks-api/node_modules'
const mk = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'syntax-'))
  writeFileSync(join(d, 'package.json'), '{"name":"t"}')
  if (existsSync(TS_SRC)) symlinkSync(TS_SRC, join(d, 'node_modules'), 'dir')
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true })
    writeFileSync(join(d, p), body)
  }
  return d
}
const hasTS = existsSync(TS_SRC)

// ── genuine breakage is caught ──
{
  const d = mk({ 'src/broken.ts': 'export const f = (u: User => {\n  return u.id\n' })
  const r = checkSyntax(d, ['src/broken.ts'])
  if (hasTS) {
    assert.ok(r.problems.length > 0, 'unbalanced parens must be caught')
    assert.equal(r.problems[0].file, 'src/broken.ts')
    assert.match(report(r), /do not parse/)
  }
  rmSync(d, { recursive: true, force: true })
}

// ── mid-layer incompleteness is NOT flagged: this is the whole reason it parses only ──
{
  const d = mk({
    'src/a.ts': "import type { NotWrittenYet } from './future'\nexport const f = (u: NotWrittenYet) => u.id\n",
    'src/b.ts': 'interface User { id: string }\nexport const g = (u: User): string => u.id\n',
    'src/c.tsx': 'export const C = () => <div className="x">hi</div>\n',
  })
  const r = checkSyntax(d, ['src/a.ts', 'src/b.ts', 'src/c.tsx'])
  if (hasTS) {
    assert.deepEqual(r.problems, [], `mid-layer/valid files must not be flagged: ${JSON.stringify(r.problems)}`)
    assert.equal(r.checked.length, 3, 'including .tsx')
  }
  rmSync(d, { recursive: true, force: true })
}

// ── what cannot be checked is REPORTED, never silently passed ──
{
  const d = mkdtempSync(join(tmpdir(), 'syntax-nots-'))
  writeFileSync(join(d, 'package.json'), '{"name":"t"}')   // no node_modules → no typescript
  mkdirSync(join(d, 'src'))
  writeFileSync(join(d, 'src/x.ts'), 'export const a = 1\n')
  const r = checkSyntax(d, ['src/x.ts'])
  assert.equal(r.problems.length, 0)
  assert.equal(r.checked.length, 0, 'must not claim to have checked it')
  assert.match(r.unverified[0], /no typescript package yet/)
  rmSync(d, { recursive: true, force: true })
}

// ── plain JavaScript: node --check is correct here ──
{
  const d = mk({ 'src/ok.mjs': 'export const a = 1\n', 'src/bad.mjs': 'export const a = {\n' })
  const r = checkSyntax(d, ['src/ok.mjs', 'src/bad.mjs'])
  assert.ok(r.checked.includes('src/ok.mjs'))
  assert.equal(r.problems.length, 1)
  assert.equal(r.problems[0].file, 'src/bad.mjs')
  rmSync(d, { recursive: true, force: true })
}

// ── Python ──
{
  const d = mk({ 'src/ok.py': 'def f():\n    return 1\n', 'src/bad.py': 'def f(:\n    return 1\n' })
  const r = checkSyntax(d, ['src/ok.py', 'src/bad.py'])
  if (!r.unverified.length) {
    assert.ok(r.checked.includes('src/ok.py'))
    assert.equal(r.problems.length, 1, 'the broken def must be caught')
    assert.equal(r.problems[0].file, 'src/bad.py')
  }
  rmSync(d, { recursive: true, force: true })
}

// ── a file deleted after being edited is not an error ──
{
  const d = mk({ 'src/a.ts': 'export const a = 1\n' })
  const r = checkSyntax(d, ['src/gone.ts'])
  assert.deepEqual(r.problems, [])
  rmSync(d, { recursive: true, force: true })
}

// ── nothing edited → no work, no output ──
assert.deepEqual(checkSyntax('/nowhere', []), { problems: [], checked: [], unverified: [] })

console.log(hasTS ? 'syntax: all assertions passed (TS path exercised)' : 'syntax: passed, TS path SKIPPED (no typescript available)')

// ── the header counts FILES, not diagnostics. One broken file emits several cascading parse
// errors; reporting "3 files do not parse" for one file is the inflation that gets a report ignored.
{
  const d = mk({ 'src/bad.ts': 'export const bad = (u: U => {\n  return u.id\n' })
  const r = checkSyntax(d, ['src/bad.ts'])
  if (hasTS) {
    assert.ok(r.problems.length >= 2, 'this input yields multiple diagnostics')
    assert.match(report(r), /^1 file\(s\) you just wrote do not parse:/, report(r).split('\n')[0])
  }
  rmSync(d, { recursive: true, force: true })
}
console.log('syntax: file-count reporting verified')
