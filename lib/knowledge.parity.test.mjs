// lib/knowledge.parity.test.mjs — run: node lib/knowledge.parity.test.mjs
//
// lib/knowledge.mjs and lib/knowledge.py are two implementations of one contract (fastapi has no
// node dependency, and the check is BLOCKING — so it cannot fall back to "skip if node is missing",
// which would be a false green in a gate).
//
// Two implementations drift; that is a law of nature. This asserts they agree on identical input,
// the same discipline that keeps lib/manifest.mjs and lib/manifest.py honest. Without it the Python
// port has no CI-level alarm at all.
//
// Skips (rather than fails) when python3 is unavailable — it must not break a JS-only checkout.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkKnowledge } from './knowledge.mjs'

const LIB = dirname(fileURLToPath(import.meta.url))

try {
  execFileSync('python3', ['--version'], { stdio: 'pipe' })
} catch {
  console.log('knowledge parity: SKIPPED (no python3)')
  process.exit(0)
}

const root = mkdtempSync(join(tmpdir(), 'kn-parity-'))
const w = (p, body) => {
  mkdirSync(join(root, dirname(p)), { recursive: true })
  writeFileSync(join(root, p), body)
}

// Every branch that matters: each definition keyword, a path anchor, a DEAD path anchor, a symbol
// that is only *mentioned* (must not satisfy), a partial-name collision, owner-gating both ways,
// unanchored prose, and a nested source dir.
w('src/a.ts', 'export class Alpha {}\nexport interface Beta {}\nexport type Gamma = 1\n')
w('src/b.ts', 'export const Delta = 1\nexport let Epsilon = 2\nexport var Zeta = 3\n')
w('src/c.ts', 'export function* Eta() {}\n// Theta is only mentioned here, never defined\n')
w('src/deep/nested/d.py', 'class Iota:\n    pass\n\ndef kappa():\n    pass\n')
w('src/e.ts', 'export class LambdaLine {}\n') // must NOT satisfy an anchor on `Lambda`
w('node_modules/pkg/x.ts', 'export class Ignored {}\n')

const term = (name, body) => w(`knowledge/domain/glossary/${name}.md`, body)
term('alpha', '---\nterm: Alpha\nanchors:\n  - symbol: Alpha\n  - path: src/a.ts\n---\nok')
term('beta', '---\nterm: Beta\nanchors:\n  - symbol: Beta\n  - symbol: Gamma\n---\nok')
term('delta', '---\nterm: Delta\nanchors:\n  - symbol: Delta\n  - symbol: Epsilon\n  - symbol: Zeta\n---\nok')
term('eta', '---\nterm: Eta\nanchors:\n  - symbol: Eta\n---\ngenerator fn')
term('iota', '---\nterm: Iota\nanchors:\n  - symbol: Iota\n  - symbol: kappa\n---\npython, nested')
term('theta', '---\nterm: Theta\nanchors:\n  - symbol: Theta\n---\nmentioned only — must FAIL')
term('lambda', '---\nterm: Lambda\nanchors:\n  - symbol: Lambda\n---\npartial collision — must FAIL')
term('gone', '---\nterm: Gone\nanchors:\n  - path: src/deleted.ts\n---\ndead path — must FAIL')
term('owned', '---\nterm: Owned\nowner: other-service\nanchors:\n  - symbol: NeverDefined\n---\nnot ours')
term('mine', '---\nterm: Mine\nowner: svc-alpha\nanchors:\n  - symbol: AlsoNeverDefined\n---\nours')
w('knowledge/domain/contexts/billing.md', '# Billing\n\nNo anchors — must be ignored entirely.')
w('knowledge/business/company.md', '# Co\n\nBusiness context is never anchored.')

const pyScript = `
import json, sys
sys.path.insert(0, ${JSON.stringify(LIB)})
from knowledge import check_knowledge
root, service = sys.argv[1], (sys.argv[2] or None)
r = check_knowledge(root, "knowledge", service=service)
print(json.dumps({
  "checked": r["checked"], "skippedNotOwner": r["skippedNotOwner"],
  "problems": sorted(r["problems"]), "entries": sorted(e["file"] for e in r["entries"]),
}, sort_keys=True))
`
const runPy = (service) =>
  JSON.parse(execFileSync('python3', ['-c', pyScript, root, service ?? ''], { encoding: 'utf8' }))
const runJs = (service) => {
  const r = checkKnowledge(root, 'knowledge', { service })
  return {
    checked: r.checked,
    skippedNotOwner: r.skippedNotOwner,
    problems: [...r.problems].sort(),
    entries: r.entries.map((e) => e.file).sort(),
  }
}

for (const service of [null, 'svc-alpha', 'other-service']) {
  const js = runJs(service)
  const py = runPy(service)
  assert.deepEqual(js, py, `implementations diverge for service=${service ?? '(none)'}`)
}

// The fixture must actually exercise what we claim, or parity is vacuous agreement on nothing.
const asAlpha = runJs('svc-alpha')
assert.ok(asAlpha.problems.some((p) => /theta/i.test(p)), 'a mere mention must not satisfy an anchor')
assert.ok(asAlpha.problems.some((p) => /lambda/i.test(p)), 'LambdaLine must not satisfy Lambda')
assert.ok(asAlpha.problems.some((p) => /gone/i.test(p)), 'a dead path must fail')
assert.ok(asAlpha.problems.some((p) => /mine/i.test(p)), 'a term this service OWNS is enforced')
assert.ok(!asAlpha.problems.some((p) => /owned/i.test(p)), "another service's term is not enforced")
assert.equal(asAlpha.skippedNotOwner, 1, 'and the skip is counted, not hidden')
// match the FILE, not a substring — /eta/ also matches "theta", which is supposed to fail
const liveTerms = ['alpha', 'beta', 'delta', 'eta', 'iota']
for (const t of liveTerms) {
  assert.ok(
    !asAlpha.problems.some((p) => p.startsWith(`knowledge/domain/glossary/${t}.md`)),
    `live anchors in ${t}.md must resolve`,
  )
}

rmSync(root, { recursive: true, force: true })
console.log('knowledge parity: JS and Python agree on all assertions')
