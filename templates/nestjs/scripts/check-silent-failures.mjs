#!/usr/bin/env node
// scripts/check-silent-failures.mjs — an error that is caught and dropped is a false green.
//
// The gate already refuses a test runner that runs zero tests (LSN-0004). This applies the same
// rule one level down, to the code the gate is protecting: `catch {}` is a check that verifies
// nothing. The request returns 200, the log stays clean, and the bug surfaces hours later
// somewhere unrelated with no stack trace to follow back.
//
// DELIBERATELY NARROW — it flags only handlers that provably discard the error and nothing else.
// A catch that logs, rethrows, or returns a typed result is fine and is never reported. A gate
// that cries wolf gets switched off, and it takes the working gates with it.
//
// THE ESCAPE HATCH IS A COMMENT. When the swallow is deliberate, say why in the code:
//
//     try { statSync(p) } catch { /* unreadable — treat as absent */ }
//     except ValueError:  # optional dependency
//
// That is the whole exemption mechanism. No waiver file, no annotation to learn — the reason lands
// where the next reader is already looking, and it costs less than adding an entry to a list.
import { readFileSync } from 'node:fs'
import { readdirSync, existsSync } from 'node:fs'
import { scanSource, sourcesUnder } from './lib/rigel-silent.mjs'

const DIRS = ['src', 'app']
const files = sourcesUnder(process.cwd(), DIRS, { readdirSync, existsSync })

if (!files.length) {
  console.log(`  · no ${DIRS.join('/ or ')}/ yet — nothing to scan`)
  process.exit(0)
}

const found = files.flatMap(([abs, rel]) => scanSource(readFileSync(abs, 'utf8'), rel))

if (!found.length) {
  console.log(`  ✓ no swallowed errors in ${files.length} source file(s)`)
  process.exit(0)
}

for (const f of found) {
  console.error(`  ✗ ${f.file}:${f.line}  ${f.snippet}`)
  console.error(`      ${f.why}`)
}
const py = found.every((f) => f.file.endsWith('.py'))
const fix = py
  ? [`· log it        except ValueError as e: log.warning("load failed: %s", e)`,
     `· re-raise it   except ValueError as e: raise AppError("load failed") from e`,
     `· own it        except ValueError:  # say why discarding is correct here`]
  : [`· log it        catch (e) { logger.error({ err: e }, 'load failed') }`,
     `· rethrow it    catch (e) { throw new AppError('load failed', { cause: e }) }`,
     `· own it        catch { /* say why discarding is correct here */ }`]

console.error(`
    ${found.length} swallowed error(s). Each one turns a failure into a success nobody can see.

    Pick one:
      ${fix.join('\n      ')}

    The third is a real answer, not a bypass — but it has to be a reason, not a shrug.
`)
process.exit(1)
