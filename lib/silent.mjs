// lib/silent.mjs — PLAN-016. An error that is caught and dropped is a false green in production.
//
// LSN-0004 says a check that verifies nothing must fail loud. That rule has always been about the
// HARNESS — a test runner that runs zero tests, a verifier with an empty manifest. This applies the
// same rule to the APPLICATION: `catch {}` is a check that verifies nothing. The request succeeds,
// the log stays clean, and the bug surfaces somewhere unrelated hours later.
//
// (Prior art: ECC ships a `silent-failure-hunter` agent for this. An agent is advisory — it finds
// them when asked. Making it a gate step means the build refuses instead, which is the whole
// difference between describing a discipline and enforcing one.)
//
// DELIBERATELY NARROW. A gate that cries wolf gets switched off, taking the working gates with it,
// so this flags only handlers that provably discard the error and nothing else:
//
//     catch {}                catch (e) {}            .catch(() => {})
//     except: pass            except X: pass          .catch(() => [])
//
// It does NOT flag a catch that logs, rethrows, returns a typed result, or carries an explanatory
// comment. That last one is the escape hatch and it needs no new file: this repo already writes
// `catch { /* optional — the dirs above are still useful */ }` when the swallow is deliberate.
// Saying WHY in the code beats an exemption list nobody reads.

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', '.next', 'venv', '.venv'])

/** A finding: what was swallowed, and where. */
const at = (file, line, snippet, why) => ({ file, line, snippet: snippet.trim().slice(0, 90), why })

/**
 * @param text  file contents
 * @param file  repo-relative path, for reporting
 * @returns findings — empty when the file is clean
 */
export function scanSource(text, file) {
  const py = file.endsWith('.py')
  const lines = text.split('\n')
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const n = i + 1

    if (py) {
      // `except:` / `except Foo:` whose entire body is `pass`. Checking the NEXT non-blank line
      // rather than regexing the block keeps this honest about Python's indentation.
      const m = /^\s*except\b[^:]*:\s*(#.*)?$/.exec(line)
      if (m) {
        if (m[1]) continue // a trailing comment explains it — deliberate
        const body = lines.slice(i + 1).find((l) => l.trim() !== '')
        if (body && /^\s*pass\s*(#.*)?$/.test(body) && !/#/.test(body)) {
          out.push(at(file, n, line + ' → pass', 'the exception is discarded with no log, no re-raise, and no explanation'))
        }
        continue
      }
      // `except Foo: pass` on one line
      if (/^\s*except\b[^:]*:\s*pass\s*$/.test(line)) {
        out.push(at(file, n, line, 'the exception is discarded with no log, no re-raise, and no explanation'))
      }
      continue
    }

    // ── JS/TS ──
    // Strip line comments and skip doc-comment continuations BEFORE matching. Prose describing a
    // silent failure is not a silent failure — flagging `// catch {} is bad` would be the exact
    // cry-wolf false positive that gets a gate switched off. (Caught by this module's own tests.)
    // A trailing `// note` is stripped too, so `catch {} // todo` still flags; block comments are
    // left intact because `catch { /* why */ }` is the deliberate escape hatch.
    const code = line.replace(/\/\/.*$/, '')
    if (/^\s*\*/.test(line) || !code.trim()) continue

    // A promise handler whose body is an empty/constant literal: .catch(() => {}) / [] / null.
    if (/\.catch\s*\(\s*\(?\s*\w*\s*\)?\s*=>\s*(\{\s*\}|\[\s*\]|null|undefined|void 0)\s*\)/.test(code)) {
      out.push(at(file, n, line, 'the rejection is replaced by a constant — downstream cannot tell failure from empty'))
      continue
    }
    // `catch {` or `catch (e) {` — inspect the block body.
    const c = /\bcatch\s*(\([^)]*\))?\s*\{/.exec(code)
    if (!c) continue
    const after = code.slice(c.index + c[0].length)
    if (/\}/.test(after)) {
      // Same-line close: `catch {}` or `catch (e) { /* why */ }`
      const inner = after.slice(0, after.indexOf('}'))
      if (!inner.trim()) out.push(at(file, n, line, 'the error is discarded with no log, no rethrow, and no explanation'))
      continue
    }
    // Multi-line block: scan to its close for ANY content.
    let depth = 1
    let body = ''
    for (let j = i + 1; j < lines.length && depth > 0; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') depth++
        else if (ch === '}') depth--
        if (depth === 0) break
      }
      if (depth > 0) body += lines[j] + '\n'
      else body += lines[j].slice(0, lines[j].indexOf('}')) + '\n'
    }
    if (!body.trim()) {
      out.push(at(file, n, line, 'the error is discarded with no log, no rethrow, and no explanation'))
    }
  }
  return out
}

/** Every source file worth scanning under `dirs`. */
export function sourcesUnder(root, dirs, { readdirSync, existsSync }) {
  const out = []
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue
      const p = `${dir}/${e.name}`
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(p, r)
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|py)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push([p, r])
    }
  }
  for (const d of dirs) if (existsSync(`${root}/${d}`)) walk(`${root}/${d}`, d)
  return out
}
