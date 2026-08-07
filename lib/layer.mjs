// lib/layer.mjs — PLAN-008 AC-4/AC-5. Company layers.
//
// A company layer is one git repo holding your organisation's overlay on a base template:
//
//   acme-rigel/
//     rigel-layer.json     { name, extends, ownership? }
//     managed/**           overlaid onto every service repo; Rigel owns these
//     seed/**              written once, then the team owns them
//
// Scaffolding from a layer = materialise the base template, then overlay. The layer's SHA is
// recorded in the manifest, so `rigel update` later reaches both the base and the layer.
//
// Fetching uses `git` directly rather than a helper library: create-rigel is zero-dependency, and
// git already knows how to authenticate to private repos via ssh keys and credential helpers —
// no token plumbing to get wrong.

import { execFileSync } from 'node:child_process'
import { cp, mkdir, readdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listKnowledgeFiles, selectForService } from './knowledge.mjs'

export const LAYER_FILE = 'rigel-layer.json'

/**
 * Resolve a --template value.
 *   express                        → built-in template
 *   gh:acme/rigel#a1b2c3           → GitHub shorthand
 *   github:acme/rigel              → same
 *   https://…/acme/rigel.git#v2    → any git URL
 *   git@github.com:acme/rigel.git  → ssh
 *   ./my-layer  /abs/path          → local directory (for developing a layer)
 */
export function parseTemplateSpec(spec, builtinStacks) {
  if (!spec) return { kind: 'builtin', stack: undefined }
  if (builtinStacks.includes(spec)) return { kind: 'builtin', stack: spec }

  const [locator, ref] = splitRef(spec)

  if (locator.startsWith('.') || locator.startsWith('/') || locator.startsWith('~')) {
    return { kind: 'local', path: locator, ref: null, spec }
  }

  const shorthand = /^(gh|github):(.+)$/.exec(locator)
  if (shorthand) return { kind: 'git', url: `https://github.com/${shorthand[2]}.git`, ref, spec }

  const gitlab = /^gitlab:(.+)$/.exec(locator)
  if (gitlab) return { kind: 'git', url: `https://gitlab.com/${gitlab[1]}.git`, ref, spec }

  // file:// is a real git protocol — used for local mirrors, air-gapped installs, and tests.
  if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/|file:\/\/)/.test(locator)) return { kind: 'git', url: locator, ref, spec }

  return { kind: 'unknown', spec }
}

// Split on the LAST '#' so ssh URLs and refs containing '/' both survive.
function splitRef(spec) {
  const i = spec.lastIndexOf('#')
  return i === -1 ? [spec, null] : [spec.slice(0, i), spec.slice(i + 1)]
}

/**
 * Fetch a layer into `dest`. Returns the exact commit SHA — pinning is the point: a layer
 * referenced by a moving branch would make every scaffold irreproducible.
 */
export function fetchLayer(parsed, dest) {
  if (parsed.kind === 'local') {
    const src = parsed.path.replace(/^~/, process.env.HOME ?? '~')
    if (!existsSync(join(src, LAYER_FILE))) {
      throw new Error(`No ${LAYER_FILE} in ${src} — that directory is not a Rigel company layer.`)
    }
    execFileSync('cp', ['-R', `${src}/.`, dest])
    return { sha: null, url: src }
  }

  const git = (...args) => execFileSync('git', args, { cwd: dest, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    git('init', '-q')
    git('remote', 'add', 'origin', parsed.url)
    // --depth 1 on an explicit ref works for branches, tags AND full SHAs on GitHub/GitLab.
    git('fetch', '--depth', '1', 'origin', parsed.ref ?? 'HEAD')
    git('checkout', '-q', 'FETCH_HEAD')
  } catch (e) {
    const detail = (e.stderr?.toString() || e.message || '').trim().split('\n').slice(-2).join(' ')
    throw new Error(
      `Could not fetch layer ${parsed.url}${parsed.ref ? `#${parsed.ref}` : ''}\n  ${detail}\n` +
        '  If it is private, make sure your git credentials work: `git ls-remote <url>`',
    )
  }
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dest, encoding: 'utf8' }).trim()

  if (!existsSync(join(dest, LAYER_FILE))) {
    throw new Error(`${parsed.url} has no ${LAYER_FILE} at its root — it is not a Rigel company layer.`)
  }
  return { sha, url: parsed.url }
}

export function readLayerConfig(dir) {
  const cfg = JSON.parse(readFileSync(join(dir, LAYER_FILE), 'utf8'))
  if (!cfg.extends) throw new Error(`${LAYER_FILE} must declare "extends": which base template it overlays.`)
  return cfg
}

/**
 * Overlay a layer onto an already-materialised base.
 *   managed/**   → always written (Rigel owns them)
 *   seed/**      → written only when absent (the team owns them after that)
 *   knowledge/** → the company's knowledge, filtered per service (PLAN-009):
 *                  whole business + whole glossary + whole map, but only THIS service's
 *                  bounded-context doc. Other services' internals are context bloat.
 */
export async function applyLayer(layerDir, target, { context = null } = {}) {
  const written = { managed: [], seed: [], knowledge: [] }

  const knowledgeDir = join(layerDir, 'knowledge')
  if (existsSync(knowledgeDir)) {
    const all = listKnowledgeFiles(knowledgeDir)
    for (const rel of selectForService(all, context)) {
      const dest = join(target, 'knowledge', rel)
      await mkdir(join(dest, '..'), { recursive: true })
      await cp(join(knowledgeDir, rel), dest)
      written.knowledge.push(rel)
    }
  }

  const managedDir = join(layerDir, 'managed')
  if (existsSync(managedDir)) {
    await cp(managedDir, target, { recursive: true })
    written.managed = await listRel(managedDir)
  }

  const seedDir = join(layerDir, 'seed')
  if (existsSync(seedDir)) {
    for (const rel of await listRel(seedDir)) {
      const dest = join(target, rel)
      if (existsSync(dest)) continue // never overwrite what the team owns
      await mkdir(join(dest, '..'), { recursive: true })
      await cp(join(seedDir, rel), dest)
      written.seed.push(rel)
    }
  }
  return written
}

async function listRel(root, dir = root, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await listRel(root, full, out)
    else out.push(full.slice(root.length + 1))
  }
  return out
}

/** Merge a layer's extra ownership globs into the base contract. */
export function mergeOwnership(base, layerOwnership = {}) {
  const merge = (k) => [...new Set([...(base[k] ?? []), ...(layerOwnership[k] ?? [])])]
  return { managed: merge('managed'), seed: merge('seed'), user: merge('user') }
}
