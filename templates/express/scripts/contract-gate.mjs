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
// Git history is the contract registry: `origin/main:docs/generated/openapi.json` is the previous
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
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SPEC = 'docs/generated/openapi.json'
const IGNORE = '.oasdiff-ignore'
const SPECS_DIR = 'docs/product-specs/ready'
const base = argFor('--base') ?? 'origin/main'
let failed = false
let breakingFound = false
let authorized = false
let exemptionsRotten = false // an expired/incomplete entry: oasdiff still suppresses it, we must not

const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => {
  console.error(`  ✗ ${m}`)
  failed = true
}

// ── 1. freshness — blocking, always ─────────────────────────────────────────────
if (!existsSync(SPEC)) {
  console.log(`  · no ${SPEC} yet — run /infra-setup and add a route first`)
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
  let good = 0
  for (const raw of readFileSync(IGNORE, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      // oasdiff has NO comment syntax — it matches EVERY line as a substring against its error
      // text. So a '#'-prefixed line that reads like an error message is a LIVE exemption wearing a
      // comment's clothes, silently suppressing that exact break. This gate and oasdiff must never
      // disagree about what a comment is. (Shipped once in v0.12.0; the seeded header's own worked
      // example was suppressing api-path-removed-without-deprecation for GET /legacy.)
      if (/\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//.test(line)) {
        bad(
          `${IGNORE}: this "commented-out" line is STILL A LIVE RULE — oasdiff has no comment syntax\n` +
            `      and matches every line as a substring. Delete it, or make it a real exemption.\n      ${line}`,
        )
      }
      continue
    }
    n++
    const exp = /#\s*expires:\s*(\d{4}-\d{2}-\d{2})/.exec(raw)
    const reason = /#\s*reason:\s*\S/.test(raw)
    if (!exp) bad(`${IGNORE}: entry has no "# expires: YYYY-MM-DD" — exemptions must self-destruct\n      ${line}`)
    else if (exp[1] < today) bad(`${IGNORE}: exemption EXPIRED on ${exp[1]} — re-justify it or fix the contract\n      ${line}`)
    if (!reason) bad(`${IGNORE}: entry has no "# reason:" — an unexplained exemption is a rubber stamp\n      ${line}`)
    // PLAN-011 AC-4: naming who you are breaking it for IS the permission step. A person, not a
    // team — diffuse ownership is how exemptions rot. `consumers: none` is a valid, explicit claim.
    const owner = /#\s*owner:\s*\S/.test(raw)
    const consumers = /#\s*consumers:\s*\S/.test(raw)
    if (!owner) bad(`${IGNORE}: entry has no "# owner: @person" — someone must own this break\n      ${line}`)
    if (!consumers) {
      bad(
        `${IGNORE}: entry has no "# consumers:" — name who this breaks (\`create-rigel impact\` lists them),\n` +
          `      or write "# consumers: none" to claim there are none\n      ${line}`,
      )
    }
    if (reason && owner && consumers && exp && exp[1] >= today) good++
  }
  exemptionsRotten = n > good // some entry is expired or missing a required annotation
  if (good) ok(`${good} contract exemption(s) present and unexpired`)
  if (n && !good) console.log(`  · ${n} exemption(s) present, none currently valid`)
}

// ── 2. breaking changes ─────────────────────────────────────────────────────────
if (!has('oasdiff')) {
  // A skipped check is NOT a pass. CI installs oasdiff (see .github/workflows/ci.yml) so the
  // enforcement point is real — but say plainly that nothing was checked here.
  console.log('  · oasdiff not installed — breaking changes were NOT CHECKED locally.')
  console.log('    CI installs it and will enforce this; to check before pushing:')
  console.log('      brew install oasdiff   |   go install github.com/oasdiff/oasdiff@latest')
} else if (!revExists(`${base}:${SPEC}`)) {
  console.log(`  · no ${base}:${SPEC} to compare against (new spec, or shallow clone) — skipped`)
} else {
  // Run oasdiff TWICE, because "did the contract break?" and "does the gate block?" are different
  // questions and conflating them makes the gate lie. The raw run is the TRUTH; the ignored run is
  // ENFORCEMENT. Without this, an exemption erases the break from the declaration cross-check
  // below — so `breaking: false` plus an exemption would pass, and AC-4 would defeat AC-3.
  const argv = (ignore) => {
    const a = ['breaking', '--fail-on', 'ERR', `${base}:${SPEC}`, SPEC]
    if (ignore) a.push('--err-ignore', IGNORE)
    return a
  }
  const raw = spawnSync('oasdiff', argv(false), { encoding: 'utf8' })
  const r = existsSync(IGNORE) ? spawnSync('oasdiff', argv(true), { encoding: 'utf8' }) : raw
  // The contract broke in fact, whether or not an exemption permits it.
  breakingFound = raw.status === 1
  // oasdiff has no concept of expiry — it suppresses an expired rule just the same. So a
  // suppressed break is only AUTHORIZED if our own expiry/annotation check also passed.
  const suppressed = raw.status === 1 && r.status === 0
  authorized = suppressed && !exemptionsRotten

  // Verified severity boundary (oasdiff 1.28): ERR = endpoint removed, REQUIRED property removed,
  // required request param added, property type changed. WARN = OPTIONAL property removed.
  // We block on ERR — but a warning still matters to a consumer, so never swallow it.
  const summary = (r.stdout || '').split('\n').find((l) => /\d+ changes:/.test(l))
  const warns = Number(/(\d+) warning/.exec(summary ?? '')?.[1] ?? 0)

  if (r.status === 0) {
    if (suppressed && !authorized) {
      bad('breaking change(s) suppressed by an EXPIRED or incomplete exemption — NOT authorized:')
      console.error(
        (raw.stdout || '').trim().split('\n').slice(0, 6).map((l) => `      ${l.trim()}`).join('\n'),
      )
    } else if (authorized) {
      // Say what actually happened. "No breaking changes" here would be false — the break is real
      // and permitted, which is a different claim, and the difference is the whole audit trail.
      ok('breaking change(s) present but AUTHORIZED by an unexpired exemption:')
      console.log(
        (raw.stdout || '').trim().split('\n').filter((l) => /^\s*(error|\s+in API|\s+\S)/.test(l))
          .slice(0, 6).map((l) => `      ${l.trim()}`).join('\n'),
      )
    } else ok('no breaking API changes')
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
    breakingFound = true
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

// ── 4. did the spec DECLARE this break? (PLAN-011 AC-3) ─────────────────────────
// At spec time the code doesn't exist, so nothing can be predicted — but the author can DECLARE
// intent, and HERE, where the diff is real, we check whether reality matched the claim.
// Asymmetric on purpose: over-declaring is free, under-declaring fails. Caution costs nothing.
{
  const declared = declaredBreaking()
  if (declared === null) {
    console.log('  · no active spec with an impact declaration — nothing to cross-check')
  } else if (breakingFound && declared === false) {
    bad(
      'UNDECLARED BREAK — the spec says `breaking: false`, but the contract broke' +
        (authorized ? ' (an exemption permits it, but the spec never claimed it).' : '.'),
    )
    console.error(`
    Either the change is wrong, or the declaration is. Fix one:
      • revert the breaking part, or
      • set  breaking: true  in the spec's impact block, name the affected consumers
        (\`create-rigel impact\` lists them), and add an authorized exemption to ${IGNORE}.`)
  } else if (breakingFound && declared === true && authorized) {
    ok('declared `breaking: true`, and the break is authorized — reality matches the claim')
  } else if (breakingFound && declared === true) {
    // Declaring is not authorizing. The declaration says you MEANT to; the exemption says who you
    // are breaking it for and by when. Both, or neither.
    console.error('  ✗ declared `breaking: true` — but it is not AUTHORIZED yet')
    console.error(`
    Add an exemption to ${IGNORE} naming who this breaks and until when:
      <the oasdiff error text above>   # reason: <why>  # owner: @you
        # expires: YYYY-MM-DD  # consumers: <from \`create-rigel impact\`>
    An expired exemption fails again, so this cannot quietly become permanent.`)
  } else if (!breakingFound && declared === true) {
    console.log('  · spec declared `breaking: true` but nothing broke — over-declaring is fine')
  } else {
    ok('no break, and none declared')
  }
}

process.exit(failed ? 1 : 0)

/**
 * The active spec's declared intent: true | false | null (no spec, or no declaration).
 * Reads the spec the active plan points at, else the only READY spec.
 */
function declaredBreaking() {
  let specFile = null
  try {
    const plans = existsSync('docs/exec-plans/active') ? readdirSync('docs/exec-plans/active') : []
    for (const pl of plans) {
      const m = /SPEC-[\w-]+/.exec(readFileSync(join('docs/exec-plans/active', pl), 'utf8'))
      if (!m) continue
      const hit = readdirSync(SPECS_DIR).find((f) => f.startsWith(m[0]))
      if (hit) { specFile = join(SPECS_DIR, hit); break }
    }
    if (!specFile && existsSync(SPECS_DIR)) {
      const ready = readdirSync(SPECS_DIR).filter((f) => f.endsWith('.md'))
      if (ready.length === 1) specFile = join(SPECS_DIR, ready[0])
    }
  } catch {
    return null
  }
  if (!specFile || !existsSync(specFile)) return null
  const m = /^\s*breaking:\s*(true|false)\s*$/m.exec(readFileSync(specFile, 'utf8'))
  return m ? m[1] === 'true' : null
}

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
