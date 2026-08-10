#!/usr/bin/env node
// scripts/check-mcp.mjs — a declared MCP server that cannot run is a silent no-op.
//
// `.mcp.json` is a declaration and nothing validates it. A typo'd command, a renamed package, or a
// server someone added on a machine where it happened to be installed globally all load as
// "configured" and then provide no tools. The agent doesn't error — it just quietly lacks a
// capability it was told it had, and answers from stale training data instead. Same false-green
// class as a test runner that executes zero tests (LSN-0004).
//
// It does NOT launch the servers or reach the network: a gate that fails because a registry was
// slow teaches people to skip the gate. It says plainly what it did not prove.
import { check, MCP_PATH } from './lib/rigel-mcp.mjs'

const r = check(process.cwd())

if (!Object.keys(r.servers).length && !r.problems.length) {
  console.log(`  · no ${MCP_PATH} — no MCP servers declared`)
  process.exit(0)
}
for (const p of r.problems) console.error(`  ✗ ${p}`)
if (r.problems.length) {
  console.error(`\n    A declared server that cannot start provides no tools and reports no error.`)
  console.error(`    Fix the entry or remove it — a server nobody can run is worse than none.\n`)
  process.exit(1)
}
const names = Object.keys(r.servers).filter((k) => k !== '//')
console.log(`  ✓ ${names.length} MCP server(s) declared and launchable: ${names.join(', ')}`)
if (r.unverified.length) {
  for (const u of r.unverified) console.log(`      · not proven working: ${u}`)
  // Naming the gap is only half a service; name the command that closes it. `claude mcp list`
  // performs the real handshake — starts each server and asks what tools it provides — which is
  // exactly what this check refuses to do, because a gate that needs the network and a registry is
  // a gate that gets skipped. Deliberately NOT wired into the gate: it is the thing to run when the
  // agent seems to be missing a capability.
  console.log(`      → \`claude mcp list\` actually starts them and reports health`)
}
process.exit(0)
