#!/usr/bin/env node
// scripts/check-package-contents.mjs
//
// LSN-0008 (ENFORCED): generated/build artifacts must never ship in the published package.
//
// v0.8.0 shipped `templates/fastapi/scripts/__pycache__/*.pyc` — Python bytecode created by a
// local `py_compile` verification, committed because the repo's own .gitignore didn't cover it.
// Scaffolded projects were unaffected (their shipped `gitignore` covers __pycache__), but every
// consumer downloaded the artifact. Component checks all passed; only inspecting the real tarball
// caught it — so this asserts on the real packed file list.
//
// Runs in repo-integrity CI. Usage: node scripts/check-package-contents.mjs
import { execFileSync } from 'node:child_process'

// Anything matching these must not be in the tarball.
const FORBIDDEN = [
  { re: /(^|\/)__pycache__\//, why: 'Python bytecode directory' },
  { re: /\.py[cod]$/, why: 'Python bytecode file' },
  { re: /\.tsbuildinfo$/, why: 'TypeScript incremental build info' },
  { re: /(^|\/)node_modules\//, why: 'installed dependencies' },
  { re: /(^|\/)\.next\//, why: 'Next.js build output' },
  { re: /(^|\/)dist\//, why: 'build output' },
  { re: /(^|\/)coverage\//, why: 'coverage report' },
  { re: /(^|\/)\.DS_Store$/, why: 'macOS finder metadata' },
  { re: /(^|\/)\.env$/, why: 'local environment file' },
]

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const files = (JSON.parse(raw)[0]?.files ?? []).map((f) => f.path)

if (files.length === 0) {
  console.error('::error::check-package-contents: npm pack reported no files — cannot verify.')
  process.exit(1)
}

const violations = []
for (const path of files) {
  const hit = FORBIDDEN.find((f) => f.re.test(path))
  if (hit) violations.push(`${path}  (${hit.why})`)
}

if (violations.length > 0) {
  console.error(`::error::${violations.length} generated artifact(s) would be published (LSN-0008):`)
  for (const v of violations) console.error(`  ✗ ${v}`)
  console.error('\nFix: delete them, and add the pattern to .gitignore (repo root) so they are never tracked.')
  process.exit(1)
}

console.log(`Package contents: ${files.length} files, no generated artifacts. ✓`)
