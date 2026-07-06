/**
 * Architecture structural tests — enforce the layer import boundaries from
 * ARCHITECTURE.md mechanically. These run in CI and in the gate-checker.
 *
 * Circular-import detection is handled separately by `npx madge --circular`
 * (see .claude/agents/gate-checker.md). This file enforces the *direction* of
 * allowed imports: a lower layer must never import from a higher one.
 *
 * Layers that do not exist yet (fresh repo, mid-build) are skipped, so this
 * suite passes immediately after /infra-setup and tightens as layers appear.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'src'

/** Recursively collect every .ts file under a directory. */
function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsFiles(full))
    else if (entry.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Extract the specifier from every `import ... from '...'` / `require('...')`. */
function importSpecifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const specs: string[] = []
  const re = /(?:from\s+|require\(\s*)['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) { if (m[1] !== undefined) specs.push(m[1]) }
  return specs
}

/** True if any file in `layerDir` imports something matching a forbidden layer. */
function findViolations(layerDir: string, forbidden: string[]): string[] {
  const violations: string[] = []
  for (const file of tsFiles(join(SRC, layerDir))) {
    for (const spec of importSpecifiers(file)) {
      for (const bad of forbidden) {
        if (spec.includes(`/${bad}/`) || spec.includes(`/${bad}`) || spec === bad) {
          violations.push(`${file} imports forbidden layer "${bad}" via "${spec}"`)
        }
      }
    }
  }
  return violations
}

describe('architecture: layer import boundaries', () => {
  it('types imports nothing from other layers', () => {
    const v = findViolations('types', ['config', 'models', 'repo', 'services', 'runtime', 'providers', 'utils'])
    expect(v).toEqual([])
  })

  it('config imports only from types', () => {
    const v = findViolations('config', ['models', 'repo', 'services', 'runtime', 'providers'])
    expect(v).toEqual([])
  })

  it('repo does not import from service or runtime', () => {
    const v = findViolations('repo', ['services', 'runtime'])
    expect(v).toEqual([])
  })

  it('service does not import express, runtime, or providers', () => {
    const v = findViolations('services', ['runtime', 'providers'])
    const expressImports = tsFiles(join(SRC, 'services')).filter((f) =>
      importSpecifiers(f).some((s) => s === 'express')
    )
    expect(v).toEqual([])
    expect(expressImports).toEqual([])
  })

  it('utils has zero domain imports', () => {
    const v = findViolations('utils', ['config', 'models', 'repo', 'services', 'runtime', 'providers'])
    expect(v).toEqual([])
  })
})
