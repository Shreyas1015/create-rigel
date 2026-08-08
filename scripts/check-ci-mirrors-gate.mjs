#!/usr/bin/env node
// scripts/check-ci-mirrors-gate.mjs — a shipped CI workflow must actually run the gate.
//
// WHY. `templates/express/.github/workflows/ci.yml` said it "mirrors `npm run gate`" and ran 4 of
// its 9 steps. verify:rigel, test:arch, assert:tests, knowledge and debug:regression were never run
// in CI at all — so provenance and the memory loop were enforced only on whoever's laptop happened
// to run `npm run gate`. nextjs shipped the same drift (4 of 8). Every such repo was affected.
//
// The comment was the bug: re-listing the gate's steps in a second file guarantees they diverge.
// So the rule is structural rather than a comparison — CI must INVOKE the gate, and then it cannot
// drift by construction, however the gate chain grows later.
//
// Only `run:` lines count. The first version of this check tested the whole file and was satisfied
// by the words "npm run gate" appearing in a comment — a check a comment could pass, which is the
// same false green it exists to prevent (LSN-0004). Caught by tamper-testing it.
//
// A template shipping no ci.yml is fine (fastapi/nestjs generate theirs at /infra-setup). One that
// ships a ci.yml which never runs the gate is not.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const TEMPLATES = 'templates'
let failed = false
const bad = (m) => {
  console.error(`  ✗ ${m}`)
  failed = true
}

/** Every shell command a workflow actually executes — comments and prose excluded. */
function runCommands(yaml) {
  const out = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:-\s*)?run:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const inline = m[1].trim()
    if (inline && inline !== '|' && !inline.startsWith('>')) {
      out.push(inline)
      continue
    }
    // A block scalar: take the indented lines that follow, minus comments.
    const indent = (lines[i].match(/^\s*/) ?? [''])[0].length
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]
      if (l.trim() === '') continue
      if ((l.match(/^\s*/) ?? [''])[0].length <= indent) break
      const t = l.trim()
      if (!t.startsWith('#')) out.push(t)
    }
  }
  return out
}

/** The gate's entry point for a template: an npm script, or a shell script for the Python stack. */
function gateEntry(stack) {
  const pkgPath = join(TEMPLATES, stack, 'package.json')
  if (existsSync(pkgPath)) {
    const scripts = JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}
    return scripts.gate ? { kind: 'npm', chain: scripts.gate } : null
  }
  // No shipped package.json. Either the gate is a shell script (fastapi), or package.json is
  // GENERATED at /infra-setup and the chain lives in the skill (nextjs, nestjs).
  if (existsSync(join(TEMPLATES, stack, 'scripts/gate.sh'))) return { kind: 'sh', chain: null }
  const skill = join(TEMPLATES, stack, '.claude/skills/00-infra-setup/SKILL.md')
  if (existsSync(skill)) {
    const m = /"gate":\s*"([^"]+)"/.exec(readFileSync(skill, 'utf8'))
    if (m) return { kind: 'npm', chain: m[1], generated: true }
  }
  return null
}

for (const stack of readdirSync(TEMPLATES).sort()) {
  const ciPath = join(TEMPLATES, stack, '.github/workflows/ci.yml')
  if (!existsSync(ciPath)) {
    console.log(`  · ${stack}: ships no ci.yml (generated at /infra-setup) — nothing to check`)
    continue
  }

  const entry = gateEntry(stack)
  if (!entry) {
    bad(`${stack}: ships a ci.yml but no gate could be located (no package.json "gate", no scripts/gate.sh)`)
    continue
  }

  const cmds = runCommands(readFileSync(ciPath, 'utf8'))
  const invokes =
    entry.kind === 'sh'
      ? cmds.some((c) => /scripts\/gate\.sh/.test(c))
      : cmds.some((c) => /\bnpm run gate\b/.test(c))
  const want = entry.kind === 'sh' ? 'scripts/gate.sh' : 'npm run gate'

  if (!invokes) {
    const steps = (entry.chain ?? '').split('&&').map((s) => s.trim()).filter(Boolean)
    const missing = steps.filter((s) => !cmds.some((c) => c.includes(s.replace(/^npm run /, ''))))
    bad(
      `${stack}: ci.yml never runs \`${want}\`.\n` +
        `      It re-lists steps instead, which is how they drift. Currently unrun in CI:\n` +
        missing.map((s) => `        ${s}`).join('\n'),
    )
    continue
  }
  const n = (entry.chain ?? '').split('&&').filter((s) => s.trim()).length
  console.log(`  ✓ ${stack}: ci.yml runs \`${want}\`${n ? ` (${n} steps, cannot drift)` : ''}`)
}

process.exit(failed ? 1 : 0)
