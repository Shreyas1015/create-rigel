// lib/silent.test.mjs — run: node lib/silent.test.mjs
// This gate only earns its place if it is PRECISE. A false positive on an idiomatic handler would
// train people to switch it off, taking the working gates with it — so the "must NOT flag" cases
// are as load-bearing as the "must flag" ones.
import assert from 'node:assert/strict'
import { scanSource } from './silent.mjs'

const hits = (src, file = 'src/a.ts') => scanSource(src, file)
const clean = (src, file = 'src/a.ts') => assert.deepEqual(hits(src, file), [], `should not flag:\n${src}`)
const flags = (src, file = 'src/a.ts') => assert.equal(hits(src, file).length, 1, `should flag:\n${src}`)

// ── JS/TS: the real thing ──
flags('try { risky() } catch {}')
flags('try { risky() } catch (e) {}')
flags('try {\n  risky()\n} catch (err) {\n\n}')
flags('await load().catch(() => [])')
flags('await load().catch(() => null)')
flags('await load().catch(() => {})')
flags('await load().catch((e) => undefined)')

// ── JS/TS: must NOT flag — every one of these is a legitimate handler ──
clean('try { risky() } catch (e) { logger.error(e) }')
clean('try { risky() } catch (e) { throw e }')
clean('try { risky() } catch (e) {\n  span.recordException(e)\n  throw new AppError(e)\n}')
clean('try { risky() } catch { /* optional — the dirs above are still useful */ }')
clean('try { risky() } catch (e) {\n  // deliberate: a missing file just means no config\n}')
clean('await load().catch((e) => reportAndRethrow(e))')
clean('await load().catch(handleError)')
clean('const empty = {}')
clean('// catch {} in a comment is not code')

// ── the escape hatch is the comment, and it needs no exemption file ──
{
  const withReason = 'try { statSync(p) } catch { /* unreadable — treat as absent */ }'
  clean(withReason)
  assert.equal(hits('try { statSync(p) } catch {}').length, 1, 'the same code WITHOUT a reason is flagged')
}

// ── Python ──
flags('try:\n    risky()\nexcept:\n    pass\n', 'src/a.py')
flags('try:\n    risky()\nexcept ValueError:\n    pass\n', 'src/a.py')
flags('try:\n    risky()\nexcept Exception: pass\n', 'src/a.py')
clean('try:\n    risky()\nexcept ValueError as e:\n    log.warning(e)\n', 'src/a.py')
clean('try:\n    risky()\nexcept ValueError:\n    raise AppError() from None\n', 'src/a.py')
clean('try:\n    risky()\nexcept ValueError:  # deliberate: optional dependency\n    pass\n', 'src/a.py')
clean('try:\n    risky()\nexcept ValueError:\n    pass  # optional dependency\n', 'src/a.py')

// ── a finding carries enough to act on ──
{
  const [f] = hits('try { x() } catch {}')
  assert.equal(f.file, 'src/a.ts')
  assert.equal(f.line, 1)
  assert.match(f.why, /no log, no rethrow, and no explanation/)
}

console.log('silent: all assertions passed')
