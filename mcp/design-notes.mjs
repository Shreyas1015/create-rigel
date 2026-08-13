#!/usr/bin/env node
// mcp/design-notes.mjs — PLAN-023 AC-3. An MCP server over a markdown reference corpus.
//
// Gives the agent something to ground a design decision IN, at the moment it is making one.
// Generic over any corpus of markdown: point it at engineering standards, your own study notes, or
// a team handbook. It ships configured in every template's `.mcp.json`, so it is available on
// install with no user action, and `mcp:check` already fails the gate if it cannot start.
//
// Corpus resolution (first hit wins):
//   1. RIGEL_NOTES_PATH        a reference library of your own
//   2. .rigel/design-refs.json a corpus pinned by this project
//   3. the bundled reference/  everyone else — zero setup
//
// NO CORPUS IS NOT AN ERROR. The server still starts and still answers; it reports an empty corpus
// and says how to configure one. A server that refuses to boot would fail `mcp:check` and take the
// whole gate down over an optional feature.
//
// Zero dependencies: MCP over stdio is newline-delimited JSON-RPC 2.0, which is about forty lines.
// Adding an SDK here would mean a runtime install before the scaffolder can verify its own config.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { buildIndex, resolveCorpus, search, topics, slug } from '../lib/design.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLED = join(HERE, '..', 'reference')
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()

// Built once at startup: a few hundred files index in ~30ms, and rebuilding per call would make
// every tool call pay for a directory walk.
const corpus = resolveCorpus(ROOT, { bundled: BUNDLED })
const index = corpus.path ? buildIndex(corpus.path) : { files: {}, anchors: 0, count: 0 }

const CONFIGURE = `No reference corpus is configured. Set RIGEL_NOTES_PATH to a directory of markdown notes, or add {"corpus": "/path"} to .rigel/design-refs.json.`

// ── tools ───────────────────────────────────────────────────────────────────────
const TOOLS = {
  list_topics: {
    description:
      'List the reference corpus topics and how many notes each holds. Call this first to learn what the corpus actually covers before searching it.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => {
      if (!index.count) return CONFIGURE
      const lines = topics(index).map((t) => `  ${t.name} — ${t.notes} note(s)`)
      return `Corpus: ${corpus.path} (source: ${corpus.source})\n${index.count} notes, ${index.anchors} sections\n\n${lines.join('\n')}`
    },
  },

  search_notes: {
    description:
      'Search the reference corpus by topic and return matching sections as citable refs (path#anchor). Use these refs verbatim in a design decision\'s `standard:` field — they are checked by the gate.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'what you want to know, e.g. "write-through cache" or "idempotency"' },
        limit: { type: 'number', description: 'max results (default 8)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: ({ query, limit }) => {
      if (!index.count) return CONFIGURE
      const hits = search(index, query, Math.min(Number(limit) || 8, 25))
      if (!hits.length) return `No sections matched "${query}". Try list_topics to see what the corpus covers.`
      return hits.map((h) => `${h.ref}\n    ${h.anchor.replace(/-/g, ' ')}`).join('\n')
    },
  },

  read_note: {
    description:
      'Read a note from the reference corpus, or one section of it. Use after search_notes to get the actual content behind a ref.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'note path as returned by search_notes, with or without #anchor' },
        section: { type: 'string', description: 'optional anchor to return just that section' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    run: ({ path, section }) => {
      if (!corpus.path) return CONFIGURE
      const [rawPath, inlineAnchor] = String(path).split('#')
      const anchor = section || inlineAnchor

      let rel = [rawPath, `${rawPath}.md`].find((c) => index.files[c])
      if (!rel) rel = Object.keys(index.files).find((k) => k.endsWith('/' + rawPath) || k.endsWith('/' + rawPath + '.md'))
      if (!rel) return `No such note: ${rawPath}. Use search_notes to find the right path.`

      // Contain reads to the corpus: a path from a tool argument must never escape it.
      const abs = resolve(corpus.path, rel)
      if (!abs.startsWith(resolve(corpus.path))) return `Refused: path escapes the corpus.`
      if (!existsSync(abs)) return `Indexed but missing on disk: ${rel}`

      const text = readFileSync(abs, 'utf8')
      if (!anchor) return clip(text, rel)

      const lines = text.split('\n')
      const start = lines.findIndex((l) => /^#{1,4}\s+/.test(l) && slug(l.replace(/^#{1,4}\s+/, '')) === anchor)
      if (start === -1) return `"${rel}" has no section "#${anchor}".\n\n${clip(text, rel)}`
      const level = (lines[start].match(/^#+/) ?? ['#'])[0].length
      let end = lines.length
      for (let i = start + 1; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,4})\s+/)
        if (m && m[1].length <= level) {
          end = i
          break
        }
      }
      return clip(lines.slice(start, end).join('\n'), `${rel}#${anchor}`)
    },
  },
}

// Notes can be long, and an MCP result lands in context whole. Truncate with the path kept, so the
// agent can re-read a specific section rather than silently working from half a page.
function clip(text, label, max = 12000) {
  const head = `<<< ${label} >>>\n\n`
  if (text.length <= max) return head + text
  return `${head}${text.slice(0, max)}\n\n… truncated (${text.length} chars). Read a single section with read_note(path, section).`
}

// ── JSON-RPC over stdio ─────────────────────────────────────────────────────────
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const ok = (id, result) => send({ jsonrpc: '2.0', id, result })
const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return // a malformed frame is not ours to answer — staying silent is the protocol-safe move
  }
  const { id, method, params } = msg

  if (method === 'initialize') {
    return ok(id, {
      // Echo the client's version when it sends one: this server's surface is stable across the
      // revisions that matter, and hard-coding one would break on the next bump.
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'rigel-design-notes', version: '1.0.0' },
    })
  }
  if (method === 'notifications/initialized' || id === undefined) return // notifications get no reply

  if (method === 'tools/list') {
    return ok(id, {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    })
  }

  if (method === 'tools/call') {
    const tool = TOOLS[params?.name]
    if (!tool) return err(id, -32602, `unknown tool: ${params?.name}`)
    try {
      return ok(id, { content: [{ type: 'text', text: String(tool.run(params.arguments ?? {})) }] })
    } catch (e) {
      // Surface the failure as tool output, not a transport error: the agent can act on the former.
      return ok(id, { content: [{ type: 'text', text: `error: ${e.message}` }], isError: true })
    }
  }

  return err(id, -32601, `method not found: ${method}`)
})
