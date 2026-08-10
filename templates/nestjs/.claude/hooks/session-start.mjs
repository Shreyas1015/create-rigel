#!/usr/bin/env node
// .claude/hooks/session-start.mjs — inject "where was I" as a derived fact.
//
// Fires on SessionStart. Everything it prints is read from artifacts already on disk: the active
// plan's own `- [ ] Layer N` checkboxes (which /build-layer ticks when a layer's gate passes), git,
// and .rigel/gate-failures.jsonl.
//
// WHY A HOOK AND NOT A CHECKLIST. `.claude/CLAUDE.md` already says to read STATE.md at session
// start. Prose guidance is followed most of the time; a hook's stdout is in context every time.
// That is the entire difference, and it is the same difference as between an agent and a gate.
//
// WHY DERIVED AND NOT REMEMBERED. STATE.md is hand-written, so it is right only if the previous
// session remembered to update it — and it is git-ignored, so a fresh clone, a new machine or a
// colleague starts with nothing. The plan file is committed and its checkboxes are ticked
// mechanically, so this survives all three.
//
// WHAT IT DOES NOT DO. It does not read the transcript or mine the session for "patterns". Lessons
// come from /curate, which derives them from recorded failures and makes them climb the memory
// ladder before anything treats them as fact. A pattern inferred from a conversation and written
// straight to disk is an assertion nobody verified.
//
// It WRITES NOTHING and always exits 0. A session-start side effect is a surprise, and a hook that
// can fail the start of a session is worse than no hook.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
  if (payload.cwd) root = payload.cwd
} catch {
  /* no payload is fine — cwd is already the right default */
}

try {
  const { resumeBlock } = await import(join(root, 'scripts/lib/rigel-resume.mjs'))
  const block = resumeBlock(root)
  if (block) process.stdout.write(block + '\n')
} catch (e) {
  // Named, not swallowed: a silent miss would let the session believe it had been given the
  // resume context when it had not.
  process.stderr.write(`[resume] skipped (${e.message})\n`)
}
process.exit(0)
