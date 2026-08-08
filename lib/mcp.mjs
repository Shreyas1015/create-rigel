// lib/mcp.mjs — PLAN-015. A declared MCP server that cannot run is a silent no-op.
//
// WHY THIS EXISTS. `.mcp.json` is a declaration, and nothing checks it. A typo'd command, a package
// that was renamed, a server someone added on a machine that had it installed globally — all of
// them load as "configured" and then simply provide no tools. The agent doesn't error; it just
// quietly lacks a capability it was told it had, and answers from stale training data instead. That
// is the same false-green class as a test runner that executes zero tests.
//
// WHAT IT CHECKS, AND WHAT IT DOES NOT. It verifies the file parses, every entry is well-formed,
// and every launcher command exists on PATH. It does NOT start the servers or reach the network:
// a gate that fails because a registry was slow teaches people to skip the gate, and a check that
// needs the internet cannot run in the sandboxes these repos build in. Stating that boundary is
// the point — `check()` returns `unverified` for exactly the part it did not prove.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

export const MCP_PATH = '.mcp.json'

/**
 * Is `bin` runnable? Walks PATH directly rather than shelling out to `command -v`: passing a
 * config-file value through `spawnSync(..., {shell: true})` concatenates it into a shell string
 * unescaped (Node DEP0190), which turns an attacker-controlled `.mcp.json` into command execution
 * on whoever runs the check. Resolving PATH ourselves is both safer and faster.
 */
export function onPath(bin) {
  if (isAbsolute(bin) || bin.includes('/')) return isExecutable(bin)
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) if (isExecutable(join(dir, bin + ext))) return true
  }
  return false
}

function isExecutable(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * @returns {{servers: object, problems: string[], unverified: string[]}}
 *   `problems` fail the check. `unverified` is what this check deliberately cannot prove — it is
 *   reported, never silently omitted, so nobody reads a pass as "the servers work".
 */
export function check(root = process.cwd(), { has = onPath } = {}) {
  const p = join(root, MCP_PATH)
  const out = { servers: {}, problems: [], unverified: [] }
  if (!existsSync(p)) return out // no declaration is not a failure — most repos have none

  let cfg
  try {
    cfg = JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    out.problems.push(`${MCP_PATH} is not valid JSON: ${e.message}`)
    return out
  }

  const servers = cfg.mcpServers
  if (servers === undefined) {
    out.problems.push(`${MCP_PATH} has no "mcpServers" key — nothing is declared, so nothing loads`)
    return out
  }
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
    out.problems.push(`${MCP_PATH}: "mcpServers" must be an object mapping name → server`)
    return out
  }
  out.servers = servers

  for (const [name, s] of Object.entries(servers)) {
    if (name === '//') continue // a comment key, not a server
    if (!s || typeof s !== 'object') {
      out.problems.push(`${name}: not an object`)
      continue
    }
    // Two shapes are legal: a local process (`command`) or a remote endpoint (`url`).
    if (s.url) {
      if (!/^https?:\/\//.test(s.url)) out.problems.push(`${name}: url must be http(s) — got "${s.url}"`)
      else out.unverified.push(`${name} (remote ${new URL(s.url).host} — not contacted)`)
      continue
    }
    if (!s.command) {
      out.problems.push(`${name}: needs either "command" (local server) or "url" (remote server)`)
      continue
    }
    if (s.args !== undefined && !Array.isArray(s.args)) {
      out.problems.push(`${name}: "args" must be an array`)
      continue
    }
    if (!has(s.command)) {
      out.problems.push(`${name}: launcher "${s.command}" is not on PATH — this server will never start`)
      continue
    }
    // The launcher exists; whether the PACKAGE it fetches resolves is a network question.
    const pkg = (s.args ?? []).find((a) => typeof a === 'string' && !a.startsWith('-'))
    out.unverified.push(`${name} (${s.command}${pkg ? ` → ${pkg}` : ''} — not launched)`)
  }
  return out
}

/** Servers a repo declares, comment keys excluded. */
export function serverNames(root = process.cwd()) {
  return Object.keys(check(root).servers).filter((k) => k !== '//')
}
