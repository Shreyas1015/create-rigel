// test/adopt.mjs — run: node test/adopt.mjs
//
// Adoption's one promise is that it never touches a file it did not write. That promise is only
// worth anything if it is checked against a REAL repo through the REAL CLI, so this drives
// `cli.js adopt` end to end rather than unit-testing the planner (lib/install.test.mjs does that).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, '..', 'cli.js')

const w = (root, rel, body) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true })
  writeFileSync(join(root, rel), body)
}
const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const manifestOf = (root) => JSON.parse(read(root, '.rigel/manifest.json'))

/** Run the CLI in `cwd`; returns {status, out}. Never throws, so exit codes can be asserted. */
function run(cwd, args) {
  try {
    const out = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { status: 0, out }
  } catch (e) {
    return { status: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

/** A plausible legacy Express repo: prod code, own CI, own ignore file, own scripts. */
function legacyRepo() {
  const root = mkdtempSync(join(tmpdir(), 'adopt-'))
  w(root, 'package.json', JSON.stringify({
    name: 'legacy-orders', version: '3.2.0',
    dependencies: { express: '^4.18.0' },
    scripts: { start: 'node src/server.js' },
  }))
  w(root, '.gitignore', 'node_modules\nMY-SECRET\n')
  w(root, 'README.md', '# Legacy Orders API\n')
  w(root, 'src/controllers/orders.js', 'module.exports.list = () => []\n')
  w(root, 'scripts/deploy.sh', 'echo deploying\n')          // a managed GLOB, but theirs
  w(root, '.github/workflows/deploy.yml', 'name: my-own-ci\n') // same
  return root
}

// ── the promise: adoption is additive and claims only what it wrote ──
{
  const root = legacyRepo()
  const theirs = ['.gitignore', 'README.md', 'src/controllers/orders.js', 'scripts/deploy.sh', '.github/workflows/deploy.yml', 'package.json']
  const before = Object.fromEntries(theirs.map((p) => [p, read(root, p)]))

  const { status, out } = run(root, ['adopt'])
  assert.equal(status, 0, `adopt should succeed:\n${out}`)
  assert.match(out, /Detected: never-rigel · express/, 'state and stack are detected, not asked')

  for (const p of theirs) {
    assert.equal(read(root, p), before[p], `${p} must be byte-identical after adoption`)
  }

  const m = manifestOf(root)
  assert.equal(m.schemaVersion, 2)
  assert.equal(m.mode, 'brownfield')
  assert.ok(m.adoptedAt, 'adoptedAt is stamped')
  assert.ok(m.baseline.includes('.gitignore'), 'a declined file is recorded as baseline')
  assert.ok(m.baseline.includes('package.json'))

  // The heart of it: a file in a managed GLOB that Rigel did not write is never owned.
  for (const p of ['scripts/deploy.sh', '.github/workflows/deploy.yml', '.gitignore', 'package.json']) {
    assert.ok(!(p in m.files), `${p} must NOT be in manifest.files — Rigel did not write it`)
  }
  assert.ok('scripts/rigel-verify.mjs' in m.files, 'but what Rigel did write IS owned')

  // And the verifier must be green, or adoption has installed a red build.
  const verify = (() => {
    try {
      return { status: 0, out: execFileSync('node', ['scripts/rigel-verify.mjs'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }) }
    } catch (e) {
      return { status: e.status ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }
    }
  })()
  assert.equal(verify.status, 0, `verify:rigel must pass in an adopted repo:\n${verify.out}`)
  assert.match(verify.out, /untracked in a managed path/, 'their files are NOTED, not failed')

  // No sidecars: a pre-existing file is `declined`, not a conflict. One sidecar is a fatal gate
  // failure, so a sidecar-per-collision would make every adopted repo red on day one.
  assert.ok(!existsSync(join(root, '.gitignore.rigel-new')), 'adoption must never emit a sidecar')

  rmSync(root, { recursive: true, force: true })
}

// ── --dry-run writes nothing ──
{
  const root = legacyRepo()
  const { status, out } = run(root, ['adopt', '--dry-run'])
  assert.equal(status, 0)
  assert.match(out, /nothing was written/)
  assert.ok(!existsSync(join(root, '.rigel/manifest.json')), 'no manifest after a dry run')
  assert.ok(!existsSync(join(root, '.claude')), 'and no harness either')
  rmSync(root, { recursive: true, force: true })
}

// ── stale-Rigel: a .rigel/ with no manifest is ADOPTED, not rejected ──
// This is bookmarks-api's exact shape, and the commonest real case.
{
  const root = legacyRepo()
  w(root, '.rigel/git-policy.json', '{"trunk":"main"}')
  w(root, '.rigel/redgreen/SPEC-001.json', '{}')
  const { status, out } = run(root, ['adopt', '--dry-run'])
  assert.equal(status, 0)
  assert.match(out, /Detected: stale-rigel/, 'an older Rigel that drifted is its own state')
  rmSync(root, { recursive: true, force: true })
}

// ── an already-adopted repo is sent to `update`, never re-adopted ──
{
  const root = legacyRepo()
  assert.equal(run(root, ['adopt']).status, 0)
  const { status, out } = run(root, ['adopt'])
  assert.equal(status, 2)
  assert.match(out, /already has \.rigel\/manifest\.json/)
  assert.match(out, /create-rigel update/)
  rmSync(root, { recursive: true, force: true })
}

// ── a collision on the VERIFIER aborts: adopting there would install a meaningless green ──
{
  const root = legacyRepo()
  w(root, 'scripts/rigel-verify.mjs', 'console.log("my own verifier")\n')
  const { status, out } = run(root, ['adopt'])
  assert.equal(status, 2)
  assert.match(out, /scripts\/rigel-verify\.mjs/)
  assert.match(out, /Nothing was written/)
  assert.ok(!existsSync(join(root, '.rigel/manifest.json')), 'and truly nothing was')
  assert.match(read(root, 'scripts/rigel-verify.mjs'), /my own verifier/, 'their file untouched')

  // --force-core moves theirs aside rather than deleting it.
  const forced = run(root, ['adopt', '--force-core'])
  assert.equal(forced.status, 0, forced.out)
  assert.match(read(root, 'scripts/rigel-verify.mjs.pre-rigel'), /my own verifier/)
  assert.ok('scripts/rigel-verify.mjs' in manifestOf(root).files, 'and Rigel now owns the verifier')
  rmSync(root, { recursive: true, force: true })
}

// ── nextjs is refused, with the reason ──
// Its arch tests + holdout are written by infra-setup.sh, not shipped, so materialize() produces an
// incomplete repo — adopting one would install checks that do not exist.
{
  const root = mkdtempSync(join(tmpdir(), 'adopt-nx-'))
  w(root, 'package.json', JSON.stringify({ name: 'web', dependencies: { next: '^14' } }))
  const { status, out } = run(root, ['adopt'])
  assert.equal(status, 2)
  assert.match(out, /Cannot adopt into a "nextjs" repo/)
  assert.match(out, /express, fastapi/)
  rmSync(root, { recursive: true, force: true })
}

// ── an unrecognisable repo asks for the stack rather than guessing ──
{
  const root = mkdtempSync(join(tmpdir(), 'adopt-unknown-'))
  w(root, 'main.rb', 'puts "hi"\n')
  const { status, out } = run(root, ['adopt'])
  assert.equal(status, 2)
  assert.match(out, /Could not tell which stack/)
  rmSync(root, { recursive: true, force: true })
}

console.log('adopt: all assertions passed')
