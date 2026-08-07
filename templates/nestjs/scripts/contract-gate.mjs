#!/usr/bin/env node
// scripts/contract-gate.mjs — PLAN-010. Don't silently break your consumers.
//
// Three checks, in the order that makes them meaningful:
//
//   1. FRESHNESS  — re-export the spec, fail if the committed one drifted.
//                   This comes FIRST and is always blocking: a stale spec makes every check below
//                   it, plus /api-sync and the service map, a lie.
//   2. BREAKING   — oasdiff against origin/main. Removing a response field, tightening a type,
//                   deleting an endpoint — all fail here unless you used an escape hatch.
//   3. EXEMPTIONS — every .oasdiff-ignore entry must carry a reason and an expiry, and an EXPIRED
//                   entry fails. A "temporary" exemption cannot quietly become permanent.
//
// Git history is the contract registry: `origin/main:openapi.json` is the previous
// version, for free. No broker, no registry, no cross-repo CI.
//
// Escape hatches, in the order you should reach for them (all native to oasdiff):
//   x-stability-level: draft   → the endpoint is exempt while it's still moving
//   deprecated + x-sunset      → expand-migrate-contract, enforced as an exit code
//   .oasdiff-ignore + expiry   → break glass, and it self-destructs
// Never a PR label: a skipped required check is a silently disabled gate.
//
// Usage: node scripts/contract-gate.mjs [--base origin/main]
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const SPEC = 'openapi.json'
const IGNORE = '.oasdiff-ignore'
const base = argFor('--base') ?? 'origin/main'
let failed = false

const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => {
  console.error(`  ✗ ${m}`)
  failed = true
}

// ── 1. freshness — blocking, always ─────────────────────────────────────────────
if (!existsSync(SPEC)) {
  console.log(`  · no ${SPEC} yet — run /infra-setup and add a controller first`)
  process.exit(0)
}
{
  const before = readFileSync(SPEC, 'utf8')
  const r = spawnSync('npm', ['run', '--silent', 'openapi:export'], { encoding: 'utf8' })
  if (r.status !== 0) {
    bad(`openapi:export failed — cannot verify the contract is current\n${(r.stderr || '').trim()}`)
  } else if (readFileSync(SPEC, 'utf8') !== before) {
    bad(`${SPEC} is STALE — the code has moved. Re-run \`npm run openapi:export\` and commit it.`)
    bad('  (everything below this validates the contract, so a stale one makes them meaningless)')
  } else {
    ok('contract is current (re-export produced no diff)')
  }
}

// ── 3. exemptions expire (checked even if oasdiff is unavailable) ────────────────
if (existsSync(IGNORE)) {
  const today = new Date().toISOString().slice(0, 10)
  let n = 0
  for (const raw of readFileSync(IGNORE, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    n++
    const exp = /#\s*expires:\s*(\d{4}-\d{2}-\d{2})/.exec(raw)
    const reason = /#\s*reason:\s*\S/.test(raw)
    if (!exp) bad(`${IGNORE}: entry has no "# expires: YYYY-MM-DD" — exemptions must self-destruct\n      ${line}`)
    else if (exp[1] < today) bad(`${IGNORE}: exemption EXPIRED on ${exp[1]} — re-justify it or fix the contract\n      ${line}`)
    if (!reason) bad(`${IGNORE}: entry has no "# reason:" — an unexplained exemption is a rubber stamp\n      ${line}`)
  }
  if (n) ok(`${n} contract exemption(s) present and unexpired`)
}

// ── 2. breaking changes ─────────────────────────────────────────────────────────
if (!has('oasdiff')) {
  // CI installs oasdiff and enforces this; locally it's a notice. The enforcement point exists,
  // which is what separates this from a check that verifies nothing anywhere.
  console.log('  · oasdiff not installed — breaking-change check skipped locally (CI enforces it)')
  console.log('    install: brew install oasdiff | go install github.com/oasdiff/oasdiff@latest')
} else if (!revExists(`${base}:${SPEC}`)) {
  console.log(`  · no ${base}:${SPEC} to compare against (new spec, or shallow clone) — skipped`)
} else {
  const args = ['breaking', '--fail-on', 'ERR', `${base}:${SPEC}`, SPEC]
  if (existsSync(IGNORE)) args.push('--err-ignore', IGNORE)
  const r = spawnSync('oasdiff', args, { encoding: 'utf8' })

  // Verified severity boundary (oasdiff 1.28): ERR = endpoint removed, REQUIRED property removed,
  // required request param added, property type changed. WARN = OPTIONAL property removed.
  // We block on ERR — but a warning still matters to a consumer, so never swallow it.
  const summary = (r.stdout || '').split('\n').find((l) => /\d+ changes:/.test(l))
  const warns = Number(/(\d+) warning/.exec(summary ?? '')?.[1] ?? 0)

  if (r.status === 0) {
    ok('no breaking API changes')
    if (warns > 0) {
      console.log(`  · ${warns} non-blocking contract change(s) — a consumer may still care:`)
      console.log(
        (r.stdout || '')
          .trim()
          .split('\n')
          .filter((l) => /warning/.test(l))
          .map((l) => `      ${l.trim()}`)
          .join('\n'),
      )
    }
  }
  else if (r.status === 1) {
    bad('BREAKING API change — consumers of this contract would break:')
    console.error((r.stdout || r.stderr || '').trim().split('\n').map((l) => `      ${l}`).join('\n'))
    console.error(`
    Ship it deliberately, in this order of preference:
      1. mark the endpoint  x-stability-level: draft   (still moving; exempt)
      2. deprecated: true + x-sunset: <date>           (migrate, then remove after the date)
      3. a line in ${IGNORE} with  # reason:  and  # expires:   (break glass; it self-destructs)
    Never a PR label — a skipped required check is a silently disabled gate.`)
  } else {
    // 100/101/102 = oasdiff itself failed. A spec that won't parse is not "a breaking change".
    bad(`oasdiff could not run (exit ${r.status}) — this is a TOOL failure, not a breaking change`)
    console.error(`      ${(r.stderr || '').trim().split('\n').slice(-2).join(' ')}`)
  }
}

process.exit(failed ? 1 : 0)

function has(bin) {
  return spawnSync('command', ['-v', bin], { shell: true, stdio: 'ignore' }).status === 0
}
function revExists(rev) {
  try {
    execFileSync('git', ['cat-file', '-e', rev], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
function argFor(flag) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}
