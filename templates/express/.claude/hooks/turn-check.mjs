#!/usr/bin/env node
// .claude/hooks/turn-check.mjs — before the turn ends, does everything it wrote still parse?
//
// Fires on Stop. Reads the paths record-edit.mjs collected this turn, parses each one, and blocks
// the turn from ending if any of them is syntactically broken.
//
// IT CHECKS PARSING, NOT TYPES — and that line is the whole design. A typecheck mid-layer is
// *expected* to fail: Layer 5 legitimately imports the service Layer 6 has not written yet. Running
// one every turn would fire on ordinary correct work (and cost ~1s on a small repo, more as it
// grows). A parse error has no such excuse: there is no point in the layer sequence where
// unbalanced braces are the intended state. So this is safe to run every turn, and nearly free.
//
// The per-layer gate is unchanged and still does the real typechecking. This only shortens the loop
// on the one class of mistake that is unambiguous the moment it is made.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

let payload = {}
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  process.exit(0)
}

// Claude Code sets this when the turn was already blocked by a Stop hook once. Blocking again would
// be a loop with no exit, so this hands control back and lets the gate catch anything left.
if (payload.stop_hook_active) process.exit(0)

const root = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
const session = String(payload.session_id || 'no-session').replace(/[^a-zA-Z0-9_-]/g, '')
const ledger = join(root, '.rigel', 'turn', `${session}.txt`)

try {
  if (!existsSync(ledger)) process.exit(0)
  const files = [...new Set(readFileSync(ledger, 'utf8').split('\n').filter(Boolean))]

  // Clear BEFORE reporting. If the clear happened afterwards and the report threw, the same files
  // would be re-checked next turn forever — the loop this hook must never create.
  rmSync(ledger, { force: true })
  if (!files.length) process.exit(0)

  const { checkSyntax, report } = await import(join(root, 'scripts/lib/rigel-syntax.mjs'))
  const r = checkSyntax(root, files)

  if (r.problems.length) {
    process.stderr.write(report(r) + '\n')
    process.exit(2) // blocks the turn ending and hands this text back to the agent
  }
  // Silence on success: a line of output on every clean turn is a tax nobody agreed to pay.
  for (const u of r.unverified) process.stderr.write(`[turn-check] not checked: ${u}\n`)
} catch (e) {
  process.stderr.write(`[turn-check] skipped (${e.message}) — gate still applies\n`)
}
process.exit(0)
