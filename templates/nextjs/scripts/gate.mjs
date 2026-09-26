#!/usr/bin/env node
// scripts/gate.mjs — run the gate, and remember what failed.
//
// The gate used to be a bare `a && b && c` chain in package.json. It blocked correctly, but it forgot
// everything: a failure fixed at the terminal was never recorded, so /curate — which runs at every
// /garbage-collect and turns repeat offenders into lessons — had nothing to learn from. An audit of
// a real project found 17 shipped plans and zero lessons. Only the gate-checker agent ever called
// record-failure, and nothing forced anyone to go through the agent.
//
// This runs the same chain with the same semantics — steps in order, stop at the first failure,
// exit with its code — and records the failing step as `gate:<script>` on the way out.
//
// THE CHAIN STAYS WHERE TEAMS ALREADY EDIT IT: `scripts["gate:chain"]` in package.json, as the same
// `npm run a && npm run b` string. Adding a check is still a one-line package.json edit.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const chain = pkg.scripts?.['gate:chain']
if (!chain) {
  console.error('✗ gate: no "gate:chain" script in package.json — nothing to run.')
  console.error('    Move the old chain there:  "gate:chain": "npm run verify:rigel && …",  "gate": "node scripts/gate.mjs"')
  process.exit(2)
}

// Our own format, split on `&&` only. Anything cleverer (||, ;, subshells) belongs in its own script.
const steps = chain.split('&&').map((s) => s.trim()).filter(Boolean)
const nameOf = (cmd) => (/^npm run ([\w:.-]+)/.exec(cmd)?.[1] ?? cmd.split(/\s+/)[0]).replace(/[^\w:.-]/g, '')

for (const [i, cmd] of steps.entries()) {
  // A single command string with shell:true — no argument array is concatenated into it (DEP0190).
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' })
  const code = r.status ?? 1
  if (code === 0) continue

  const step = nameOf(cmd)
  console.error(`\n✗ gate failed at step ${i + 1}/${steps.length}: ${cmd}  (exit ${code})`)
  if (existsSync('scripts/record-failure.mjs')) {
    const rec = spawnSync(process.execPath, ['scripts/record-failure.mjs', `gate:${step}`, `\`${cmd}\` exited ${code}`], { encoding: 'utf8' })
    // Recording is bookkeeping: its failure must never change the gate's verdict — but it is said out loud.
    if (rec.status === 0) console.error(`  ${rec.stdout.trim()}  → /curate turns repeat offenders into lessons`)
    else console.error(`  (could not record this failure: ${(rec.stderr || '').trim().split('\n')[0]})`)
  }
  process.exit(code)
}
console.log(`\n✓ gate: all ${steps.length} step(s) passed`)
