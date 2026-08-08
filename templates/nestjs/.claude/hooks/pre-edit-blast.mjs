#!/usr/bin/env node
// .claude/hooks/pre-edit-blast.mjs — hand over the blast radius BEFORE the edit lands.
//
// Fires on PreToolUse for Write/Edit/MultiEdit. The first time a session touches a file that a
// large share of the repo depends on, this denies the call and spends the denial listing the
// importers. The retry goes through.
//
// So this is NOT a gate, and does not pretend to be one: it cannot stop a determined edit. What it
// makes impossible is changing a load-bearing file *without having been shown what depends on it*.
// `npm run gate` is still where enforcement lives. Two layers, different jobs — a PreToolUse deny
// binds this agent in this session; the gate binds any author, including a human and CI.
//
// TWO RULES KEEP IT FROM BECOMING NOISE, because a hook that fires constantly gets deleted and
// takes the useful hooks with it:
//   1. At most 15% of a repo's source files can ever qualify — a ceiling, not a tuned constant.
//      An absolute cutoff does not transfer: ">= 8 dependents" denied 48% of edits in one real repo
//      and 8% in another.
//   2. Once per file per session. Repeated identical denials are what drove ECC's sessions into a
//      "degenerate repetition loop"; their write-up is the reason this is capped at all.
//
// IT FAILS OPEN. Any error here — unreadable payload, unparsable graph, missing lib — exits 0 and
// lets the edit through, with a note on stderr. That is deliberate and it is the opposite of the
// usual rule (LSN-0004: a check that verifies nothing must fail loud). The difference is what
// failure costs: a broken gate lets one bad commit through, while a broken PreToolUse hook that
// fails closed blocks *every* edit and bricks the session. Enforcement belongs in the gate, where
// failing loud is safe; this layer's job is delivering facts, and a fact it cannot compute is not
// worth halting work over.

import { readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (fd) => {
  try {
    return readFileSync(fd, 'utf8')
  } catch {
    return ''
  }
}

let payload
try {
  payload = JSON.parse(read(0) || '{}')
} catch {
  process.exit(0) // not a payload we understand — never block on that
}

const root = payload.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
const session = String(payload.session_id || 'no-session').replace(/[^a-zA-Z0-9_-]/g, '')
const file = payload.tool_input?.file_path || payload.tool_input?.path || ''

try {
  const { assess, toRepoPath, denyMessage } = await import(join(root, 'scripts/lib/rigel-blast.mjs'))

  const rel = toRepoPath(root, file)
  if (!rel) process.exit(0)

  // Seen-set first: it is a file read, where the graph walk is a directory walk. Checking the cheap
  // thing first keeps the common case (a file already shown this session) near-free.
  const seenFile = join(root, '.rigel', 'blast', `${session}.txt`)
  const seen = existsSync(seenFile) ? read(seenFile).split('\n') : []
  if (seen.includes(rel)) process.exit(0)

  const a = assess(root, rel)
  if (!a.hot) process.exit(0)

  // Record BEFORE denying. If the write failed after the deny, the retry would be denied too and
  // the session would loop on it forever — the exact failure this design exists to avoid.
  mkdirSync(join(root, '.rigel', 'blast'), { recursive: true })
  appendFileSync(seenFile, rel + '\n')

  process.stderr.write(denyMessage(rel, a) + '\n')
  process.exit(2)
} catch (e) {
  // Say what was lost. Silence here would be its own false green — the session would believe the
  // blast radius had been checked and found clear.
  process.stderr.write(`[blast] skipped (${e.message}) — edit allowed, gate still applies\n`)
  process.exit(0)
}
