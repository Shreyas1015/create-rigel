#!/usr/bin/env node
// .claude/hooks/record-edit.mjs — note which files this turn touched, for the Stop check.
//
// Runs on PostToolUse alongside post-write.sh. It exists only so `turn-check.mjs` knows what to
// look at: reading the transcript to work that out would be inference, and a list the tool calls
// themselves wrote is a fact.
//
// Appends one repo-relative path per line to .rigel/turn/<session>.txt, which turn-check.mjs
// consumes and clears. Git-ignored, per-session, and never read by anything else.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

try {
  const p = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const root = p.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const file = p.tool_input?.file_path || p.tool_input?.path
  if (!file) process.exit(0)

  const norm = String(file).replace(/\\/g, '/')
  const base = root.replace(/\\/g, '/').replace(/\/$/, '')
  const rel = norm.startsWith(base + '/') ? norm.slice(base.length + 1) : norm.startsWith('/') ? null : norm
  if (!rel || !/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py)$/.test(rel)) process.exit(0)

  const session = String(p.session_id || 'no-session').replace(/[^a-zA-Z0-9_-]/g, '')
  mkdirSync(join(root, '.rigel', 'turn'), { recursive: true })
  appendFileSync(join(root, '.rigel', 'turn', `${session}.txt`), rel + '\n')
} catch {
  /* recording is best-effort — never fail a tool call over bookkeeping */
}
process.exit(0)
