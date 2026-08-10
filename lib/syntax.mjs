// lib/syntax.mjs — PLAN-020. Does the file the agent just wrote actually parse?
//
// WHY PARSE AND NOT TYPECHECK. ECC runs a typecheck at the end of every response. Faster feedback
// than our per-layer gate, and the instinct is right — but a typecheck mid-layer is *expected* to
// fail. Layer 5 legitimately imports the service that Layer 6 has not written yet. A hook that
// shouts about that on every turn is the cry-wolf failure, and it costs ~1 s on a 78-file repo,
// growing with the repo, on every single turn.
//
// A **parse** error is different in kind: a file that does not parse is broken no matter how
// incomplete the feature is. There is no point in the layer sequence where unbalanced braces are
// the intended state. So this checks exactly that — syntax only — which makes it both safe to run
// every turn and essentially free (measured: 0.035 ms per TypeScript file).
//
//   valid TS                                      → 0 errors   ✓
//   `export const f = (u: User => {`              → 2 errors   ✗ caught
//   imports a type Layer 6 has not written yet    → 0 errors   ✓ correctly ignored
//
// WHY NOT `node --check`. It is worse than nothing on TypeScript: it rejects valid files (`interface`
// is a SyntaxError to it) *and* returns 0 for genuinely broken ones. A false red and a false green
// from the same tool. It is used here only for real JavaScript, where it is correct.
//
// WHAT IT CANNOT CHECK IS REPORTED, NEVER SKIPPED. Before `/infra-setup` runs there is no
// `typescript` package to parse with. That returns `unverified` with the reason — a check that
// quietly passes what it could not examine is the false green this project exists to refuse.

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const TS_RE = /\.(ts|tsx|mts|cts)$/
const JS_RE = /\.(js|jsx|mjs|cjs)$/
const PY_RE = /\.py$/

/** The repo's own TypeScript, or null before dependencies are installed. */
function loadTypeScript(root) {
  try {
    return createRequire(join(root, 'package.json'))('typescript')
  } catch {
    return null // reported as `unverified` by the caller — never treated as a pass
  }
}

/**
 * @param root   repo root
 * @param files  repo-relative paths edited this turn
 * @returns {{problems: Array<{file,line,message}>, checked: string[], unverified: string[]}}
 */
export function checkSyntax(root, files) {
  const out = { problems: [], checked: [], unverified: [] }
  if (!files.length) return out

  const ts = files.some((f) => TS_RE.test(f)) ? loadTypeScript(root) : null

  for (const rel of files) {
    const abs = join(root, rel)
    let src
    try {
      src = readFileSync(abs, 'utf8')
    } catch {
      continue // deleted or moved after the edit — not this check's business
    }

    if (TS_RE.test(rel)) {
      if (!ts) {
        out.unverified.push(`${rel} (no typescript package yet — run /infra-setup)`)
        continue
      }
      const kind = rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, kind)
      for (const d of sf.parseDiagnostics ?? []) {
        const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0)
        out.problems.push({ file: rel, line: line + 1, message: ts.flattenDiagnosticMessageText(d.messageText, ' ') })
      }
      out.checked.push(rel)
      continue
    }

    if (JS_RE.test(rel)) {
      // Real JavaScript — `node --check` is correct here, and is the same parser that will run it.
      const r = run('node', ['--check', abs])
      if (r.code !== 0) out.problems.push({ file: rel, line: lineFrom(r.err), message: firstError(r.err) })
      else out.checked.push(rel)
      continue
    }

    if (PY_RE.test(rel)) {
      const r = run('python3', ['-c', 'import ast,sys;ast.parse(open(sys.argv[1],encoding="utf-8").read(),sys.argv[1])', abs])
      if (r.code === 127) out.unverified.push(`${rel} (python3 not on PATH)`)
      else if (r.code !== 0) out.problems.push({ file: rel, line: lineFrom(r.err), message: firstError(r.err) })
      else out.checked.push(rel)
    }
  }
  return out
}

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' })
    return { code: 0, err: '' }
  } catch (e) {
    // ENOENT surfaces as a spawn error with no status; report it as "absent", not as a failure.
    return { code: e.status ?? 127, err: String(e.stderr ?? e.message ?? '') }
  }
}

const lineFrom = (err) => Number((err.match(/(?:^|\D):(\d+)(?::\d+)?/m) ?? [])[1]) || null
const firstError = (err) =>
  (err.split('\n').find((l) => /Error|error/.test(l)) ?? err.split('\n')[0] ?? 'failed to parse').trim().slice(0, 140)

/** The message fed back to the agent. Short: it is read mid-task, not filed. */
export function report(r) {
  // Count FILES, not problems — one broken file usually yields several cascading parse errors, and
  // "3 files do not parse" when it is one file is the kind of inflation that makes a report ignored.
  const n = new Set(r.problems.map((p) => p.file)).size
  const L = [`${n} file(s) you just wrote do not parse:`, '']
  for (const p of r.problems) L.push(`  ${p.file}${p.line ? `:${p.line}` : ''}  ${p.message}`)
  L.push('', 'A file that does not parse is broken regardless of how incomplete the layer is.')
  L.push('Fix these before finishing the turn — nothing downstream can run against them.')
  return L.join('\n')
}
