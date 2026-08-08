// lib/mcp.test.mjs — run: node lib/mcp.test.mjs
// The whole value of this check is that a broken declaration fails instead of loading silently,
// so every way a server can be silently dead is pinned here.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { check, serverNames } from './mcp.mjs'

const mk = () => mkdtempSync(join(tmpdir(), 'mcp-'))
const w = (root, obj) => writeFileSync(join(root, '.mcp.json'), JSON.stringify(obj))
const yes = () => true
const no = () => false

// ── no declaration is not a failure — most repos have none ──
{
  const r = check(mk())
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.servers, {})
}

// ── a well-formed local server passes, and is reported as NOT launched ──
{
  const root = mk()
  w(root, { mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } } })
  const r = check(root, { has: yes })
  assert.deepEqual(r.problems, [])
  assert.equal(r.unverified.length, 1)
  assert.match(r.unverified[0], /context7 \(npx → @upstash\/context7-mcp — not launched\)/,
    'a pass must say plainly what it did not prove')
  assert.deepEqual(serverNames(root), ['context7'])
  rmSync(root, { recursive: true, force: true })
}

// ── THE bug this exists for: a launcher that is not installed ──
{
  const root = mk()
  w(root, { mcpServers: { thing: { command: 'definitely-not-installed' } } })
  const r = check(root, { has: no })
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /is not on PATH — this server will never start/)
  rmSync(root, { recursive: true, force: true })
}

// ── malformed declarations are caught rather than half-loaded ──
{
  const root = mk()
  writeFileSync(join(root, '.mcp.json'), '{ not json')
  assert.match(check(root).problems[0], /not valid JSON/)

  w(root, { servers: {} })
  assert.match(check(root).problems[0], /no "mcpServers" key/)

  w(root, { mcpServers: [] })
  assert.match(check(root).problems[0], /must be an object/)

  w(root, { mcpServers: { a: { args: ['x'] } } })
  assert.match(check(root, { has: yes }).problems[0], /needs either "command".*or "url"/)

  w(root, { mcpServers: { a: { command: 'npx', args: 'not-an-array' } } })
  assert.match(check(root, { has: yes }).problems[0], /"args" must be an array/)
  rmSync(root, { recursive: true, force: true })
}

// ── remote servers: shape is checked, the host is never contacted ──
{
  const root = mk()
  w(root, { mcpServers: { remote: { url: 'https://mcp.example.com/sse' } } })
  const ok = check(root, { has: no })  // `has` is irrelevant for a remote server
  assert.deepEqual(ok.problems, [])
  assert.match(ok.unverified[0], /remote mcp\.example\.com — not contacted/)

  w(root, { mcpServers: { bad: { url: 'ftp://nope' } } })
  assert.match(check(root).problems[0], /url must be http\(s\)/)
  rmSync(root, { recursive: true, force: true })
}

// ── a "//" comment key is documentation, not a server ──
{
  const root = mk()
  w(root, { '//': 'top note', mcpServers: { '//': 'inner note', real: { command: 'npx' } } })
  const r = check(root, { has: yes })
  assert.deepEqual(r.problems, [])
  assert.deepEqual(serverNames(root), ['real'])
  rmSync(root, { recursive: true, force: true })
}

console.log('mcp: all assertions passed')
