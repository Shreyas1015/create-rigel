# PLAN-024 — Close the gaps the gita-chat-astro audit found

**Target:** v0.30.0
**Status:** SHIPPED in v0.30.0

---

## Context

An audit of a real two-repo project built on Rigel (gita-chat-astro: 67 + 61 commits, 17 plans
shipped) split the harness cleanly in two. Everything in the refuse chain ran 1:1 — 17 grill
proofs, 17 design records, 17 red-green proofs, 263 acceptance tests. Everything advisory never
ran once: zero lessons, an empty knowledge layer, no recorded failures, and a server CI that never
invoked the gate. A later session added a sixth: a design index that cannot tell when the notes it
was built from have changed.

None of these are user error. Each is a place where Rigel relies on someone remembering, which is
the exact thing its cardinal rule says not to do.

---

## AC-1 — The pipeline text is derived, not typed

`cli.js:794` prints `/write-roadmap → /write-spec → /write-plan → /build-layer` — missing
`/write-design`, three releases after it shipped. The first thing a new user reads describes a
pipeline that no longer exists.

**Fix.** Print the pipeline from the scaffolded template's own numbered skills (`01`–`05`), so it
cannot drift from the skills it describes. `/grill` is a step inside `/write-spec`, not a skill,
and is named there. Smoke asserts every numbered pipeline skill appears in the printed text.

## AC-2 — fastapi ships its CI instead of describing it

fastapi's `/infra-setup` tells the agent to *create* a CI with parallel jobs that **copy** gate
steps (ruff, mypy, pytest). It never runs `make gate`, which is LSN-0015 broken by the template
itself — and because it is prose, the CI-mirror check skips it ("nothing to check"). The gita
server is the result: design, knowledge, silent-failure, MCP and provenance checks run only on a
laptop.

**Fix.** Ship `templates/fastapi/.github/workflows/ci.yml` whose required job runs `make gate`.
Checks the gate does not do (image build + Trivy + SBOM, pip-audit, gitleaks) stay as independent
jobs, not copies. `/infra-setup` stops describing CI generation. The mirror check **fails** any
scaffoldable stack that ships no CI, rather than skipping it.

`.github/**` is managed, so existing repos receive it through `update` — as a `.rigel-new` sidecar
beside the CI they already wrote, never an overwrite.

## AC-3 — Doctor knows which stack it is looking at

- Accepts `make gate` / `scripts/gate.sh` as "CI runs the gate", and gives the fix in the stack's
  own command. It told a Python repo to add `npm run gate`.
- Recognises fastapi's zero-tests guard, which lives inside `gate.sh`. It reported it missing.
- New: reports when the gate does not record its own failures (AC-4), when knowledge is empty after
  shipped plans (AC-5), and when the design index is stale (AC-6).

## AC-4 — The gate records its own failures

`record-failure` is called only by the gate-checker agent. Run the gate from a terminal and a
failure is fixed and forgotten, so `/curate` — called at every `/garbage-collect` — has nothing to
work with. Seventeen plans, zero lessons.

**Fix.**
- **Node stacks:** `scripts/gate.mjs` (managed) runs the chain step by step with `&&` semantics
  and records a failing step as `gate:<script>`. The chain stays in `package.json` where teams
  already edit it, renamed `gate:chain`; `gate` becomes `node scripts/gate.mjs`.
- **fastapi:** `gate.sh`'s `fail` records `gate:<step>` for the step that failed.
- **Dedupe:** one record per signature per commit, so re-running a red gate while fixing it does
  not inflate the count `/curate` promotes on.
- **Existing repos:** `package.json` is seed and is never edited by Rigel. `doctor` detects the old
  chain and prints the exact two-line change.

## AC-5 — An empty knowledge layer stops passing silently

`rigel knowledge` on an empty layer prints "no anchored entries to verify here" and exits 0 — a
check that verified nothing, reported as a pass (LSN-0004).

Failing every fresh scaffold would be cry-wolf: day one has no knowledge. So it fails once there is
evidence it should exist — **at least one completed plan** — unless the repo records a deliberate
decision in `.rigel/knowledge-optout` with a reason. Silence is not allowed; a stated decision is.
Mirrored in JS and Python.

## AC-6 — The design index knows what it indexed

`design-index` records paths and anchors but not which version of the corpus they came from. The
MCP server always reads the live notes; the committed index — what `design:check` verifies
citations against — goes stale. A renamed or deleted note is then a **false green**: a citation to
a section that no longer exists still passes.

**Fix.**
- Record `corpusCommit` (and whether the tree was dirty) plus a content fingerprint, so non-git
  corpora are covered too.
- When the corpus is present, `design:check` verifies against the **live** corpus — a citation to a
  deleted section fails, truthfully — and warns that the committed index is stale, naming both
  commits.
- When the corpus is absent (CI), it uses the committed index and says which commit it reflects.

## AC-7 — Verify end to end

From a packed tarball: scaffold express and fastapi; break each check on purpose and watch it
fail; confirm a gate failure lands in `gate-failures.jsonl` exactly once per commit. Then run
`update` against a **copy** of the gita server — never the real repo — and confirm the fixes arrive
the way ownership says they should: managed files updated, the CI as a sidecar, `package.json`
untouched with doctor naming the change.

---

## Out of scope

- **nestjs** — delisted and not scaffoldable. It gets `gate.mjs` because it shares the Node runner;
  its CI stays generated.
- **Rewriting existing CI files in place.** A sidecar is the only honest move for a file the team
  wrote.
- **Auto-writing knowledge entries.** AC-5 makes the absence visible; filling the layer stays
  `/backfill-knowledge`, with a human deciding what the terms mean.

## Sequence

AC-1 → AC-3 → AC-6 → AC-5 → AC-2 → AC-4 → AC-7 → v0.30.0. Smallest and most isolated first; AC-4
last among the fixes because it changes what `gate` means for every Node stack.
