# PLAN-010 — The contract gate + `/postmortem`

**Status:** ACTIVE
**Target release:** v0.12.0
**Owner:** @Shreyas1015
**Research:** the cross-service contract-drift stream (4 sub-reports, PLAN-008 research phase)

---

## What this plan does, in plain words

Two small things, both already unblocked by PLAN-008/009.

**1. Stop a service from silently breaking its consumers.** Rigel already generates an OpenAPI
contract. Right now nothing checks whether a change to it is *breaking*. This adds that check —
in the provider's own repo, with no broker, no registry, and no cross-repo CI.

**2. Make an incident end in a rule instead of a document.** `/postmortem` opens a lesson on the
PLAN-007 ladder with a required "what check would have caught this?" and a promotion deadline. The
deliverable of a postmortem is a merged CI rule.

---

## The design decision that keeps this free

**Git history is the contract registry.** `origin/main:openapi.json` is the previous version, for
nothing. No shared contracts repo, no Pact broker, no hosted service.

And **the gate runs in the provider's own repo at merge time.** The research was blunt about why
cross-repo merge-time gating doesn't work: Pact Broker's own recommended trigger is the same
fire-and-forget `repository_dispatch` that Specmatic uses — the contracts PR goes green while
consumers break asynchronously, in repos the author isn't watching. Gating at *deploy* time is the
real fix, and that needs the broker we're not buying. So: gate what you can prove locally, and be
honest about the rest.

---

## Acceptance Criteria

### AC-1 — Spec-freshness gate (blocking day one)
Re-run `openapi:export`; `git diff --exit-code` the committed contract. Fails if the spec is stale.

**This is not optional and it comes first.** A generated spec that has drifted from the code makes
every downstream check — the breaking-change gate, the service map, `/api-sync` — a lie. It costs
one line. Without it the rest of this plan validates a stale artifact.

### AC-2 — Breaking-change gate
```bash
oasdiff breaking --fail-on ERR origin/main:openapi.json openapi.json
```
- **`--fail-on ERR` is mandatory.** Without it `oasdiff breaking` exits 0 even on a breaking change
  and the gate is decorative.
- Distinguish exit **1** (a real breaking change) from **100/101/102** (tool or spec-load failure) —
  a spec that fails to parse must not read as "breaking".
- Pin **≥ v1.26.1** (a git revision beginning with `-` was parsed as an option → arbitrary file
  overwrite). Never interpolate an unsanitised branch name into the `<ref>:<path>` argument.
- Needs `fetch-depth: 0` in CI or `origin/main` won't resolve.
- **Availability:** CI installs oasdiff and the check is blocking there. Locally it skips with a
  notice when the binary is absent. That is not a false green in the LSN-0004 sense — the
  enforcement point is CI, and CI always has it. Say so in the skip message.

### AC-3 — The escape hatch (three levels, all inside oasdiff)
A gate that makes breaking changes *impossible* is wrong. Ranked, use in this order:

1. **`x-stability-level: draft`** — new endpoints scaffold as draft and are exempt entirely.
   Absence defaults to `stable`, so the default is strict and you opt *into* looseness.
2. **`deprecated: true` + `x-sunset: <date>`** — deprecation is explicitly non-breaking; removal
   after the sunset date is non-breaking; removal before it, or moving the date earlier, is
   breaking. Expand-migrate-contract rendered as an exit code.
3. **A committed `.oasdiff-ignore` line** with a mandatory `# reason:` and `# expires: YYYY-MM-DD`,
   plus a gate step that **fails when an entry is past its expiry**. The exemption self-destructs.

**Never a PR label**, and never `if: !contains(labels…)` to skip the job — a skipped required check
is a silently disabled gate, and the exemption evaporates on merge leaving nothing in the repo.

### AC-4 — `/postmortem`
A `/curate` variant. Not an ops persona: no SEV matrix, no on-call ceremony — none of that fails a
build.

```
/postmortem "<what happened>"
  → opens docs/design-docs/lessons/LSN-XXXX at status: INVESTIGATED
  → REQUIRED field: "what check would have caught this?"
  → REQUIRED field: promotion deadline (a date)
  → prints the promotion command for when the check is written
```

It reuses the whole PLAN-007 ladder and the `verify-promotion` gate shipped in v0.9.0. The
documented failure of postmortems is follow-through, not analysis — so the artifact is a lesson
with a deadline, and a merged CI rule cannot silently expire.

### AC-5 — Verify end-to-end
- Change a route without re-exporting → freshness gate fails; re-export → passes.
- Remove a response property → oasdiff fails with exit 1; mark the endpoint `x-stability-level:
  draft` → passes; `deprecated` + a future `x-sunset` → passes.
- Add an `.oasdiff-ignore` entry with a past expiry → fails.
- Corrupt the spec → tool-failure exit code is reported as such, not as "breaking".
- `/postmortem` opens a lesson at INVESTIGATED with both required fields; `verify-promotion`
  refuses it until a check exists and the tamper test is attested.

---

## Progress log
- [ ] AC-1 spec-freshness gate
- [ ] AC-2 breaking-change gate (`--fail-on ERR`, exit-code discrimination, pinned version)
- [ ] AC-3 escape hatch: stability levels, sunset, expiring ignore entries
- [ ] AC-4 `/postmortem` skill
- [ ] AC-5 end-to-end verification

---

## Explicitly out of scope
- **Pact / a contract broker.** Correct at 4+ services or 2+ teams; strongly negative ROI for one
  team. Re-run the argument then — the tool is healthy, the cost is the consumer tests and the
  broker you must operate, not the library.
- **Cross-repo merge-time blocking.** Structural: every cross-repo webhook mechanism is
  fire-and-forget. A consumer discovers a provider change on its next scheduled run.
- **Async / queue payload contracts.** Verified empirically: `asyncapi diff` exits 1 on channel
  removal but **0** on a payload property removal and on a `string`→`integer` change. There is no
  async equivalent of oasdiff. Ship a documented non-goal rather than a gate nobody can trust.
- **Consumer-awareness.** oasdiff cannot tell you *which* consumer uses the field you removed. Its
  characteristic error is a false positive — which is exactly why AC-3 is load-bearing.
