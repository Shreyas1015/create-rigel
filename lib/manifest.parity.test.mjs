// lib/manifest.parity.test.mjs — run: node lib/manifest.parity.test.mjs
//
// lib/manifest.mjs and lib/manifest.py are two implementations of one contract (fastapi has no
// node dependency, so it needs the Python one). Two implementations drift — that is a law of
// nature — so this asserts they agree on identical input, the same discipline already used for
// curate_scan's JS/Python pair.
//
// If Python 3 isn't available, this SKIPS rather than fails: it must not break a JS-only checkout.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globToRegExp, classify, resolveOwnership, walkFiles, hashManaged } from './manifest.mjs'

const LIB = dirname(fileURLToPath(import.meta.url))

function havePython() {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
if (!havePython()) {
  console.log('manifest parity: SKIPPED (no python3)')
  process.exit(0)
}

// A fixture exercising every branch: ** vs *, dot escaping, precedence, the manifest special case,
// nested dirs, and a skipped dir that must be invisible to both.
const root = mkdtempSync(join(tmpdir(), 'rigel-parity-'))
const write = (p, body = 'x') => {
  mkdirSync(join(root, dirname(p)), { recursive: true })
  writeFileSync(join(root, p), body)
}
write('.claude/CLAUDE.md', 'a')
write('.claude/skills/curate/SKILL.md', 'b')
write('scripts/gate.sh', 'c')
write('docs/git-workflow.md', 'd')
write('docs/design-docs/memory.md', 'e')
write('docs/product-specs/SPEC-001.md', 'f')
write('src/index.ts', 'g')
write('.prettierrc', 'h')
write('.rigel/manifest.json', '{}')
write('node_modules/pkg/index.js', 'ignored')
write('some/random/file.txt', 'unclassified')
write('.claude/rules/testing.md.rigel-new', 'debris')

const table = {
  common: {
    managed: ['.claude/**', 'scripts/**'],
    seed: ['docs/*.md', 'docs/design-docs/**', '.prettierrc'],
    user: ['src/**', 'docs/product-specs/**'],
  },
  express: { seed: ['package.json'] },
}
const ownership = resolveOwnership(table, 'express')

// ── run the Python side over the same fixture ──
const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(LIB)})
from manifest import classify, resolve_ownership, walk_files, hash_managed, glob_to_regex
table = json.loads(sys.argv[1]); root = sys.argv[2]
own = resolve_ownership(table, "express")
files = walk_files(root)
print(json.dumps({
  "ownership": own,
  "files": files,
  "classified": {p: classify(p, own) for p in files},
  "managed": hash_managed(root, own),
  "globs": {g: [p for p in files if glob_to_regex(g).match(p)] for g in
            [".claude/**", "docs/*.md", "docs/**/*.md", ".prettierrc", "src/**"]},
}, sort_keys=True))
`
const pyOut = JSON.parse(
  execFileSync('python3', ['-c', py, JSON.stringify(table), root], { encoding: 'utf8' }),
)

// ── the JS side ──
const files = walkFiles(root).sort()
const jsOut = {
  ownership,
  files,
  classified: Object.fromEntries(files.map((p) => [p, classify(p, ownership)])),
  managed: hashManaged(root, ownership),
  globs: Object.fromEntries(
    ['.claude/**', 'docs/*.md', 'docs/**/*.md', '.prettierrc', 'src/**'].map((g) => [
      g,
      files.filter((p) => globToRegExp(g).test(p)),
    ]),
  ),
}

assert.deepEqual(jsOut.ownership, pyOut.ownership, 'resolveOwnership differs')
assert.deepEqual(jsOut.files, pyOut.files, 'walkFiles differs (skip-dirs? ordering?)')
assert.deepEqual(jsOut.classified, pyOut.classified, 'classify differs')
assert.deepEqual(jsOut.managed, pyOut.managed, 'hashManaged differs (hashes must be identical)')
assert.deepEqual(jsOut.globs, pyOut.globs, 'glob semantics differ')

// sanity: the fixture actually exercised what we think it did
assert.equal(jsOut.classified['.rigel/manifest.json'], 'manifest')
assert.equal(jsOut.classified['some/random/file.txt'], null)
assert.equal(jsOut.classified['docs/product-specs/SPEC-001.md'], 'user')
assert.ok(!jsOut.files.some((p) => p.startsWith('node_modules/')), 'node_modules must be skipped')

rmSync(root, { recursive: true, force: true })
console.log('manifest parity: JS and Python agree on all assertions')
