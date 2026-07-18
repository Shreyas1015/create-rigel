# /write-spec — Write a Product Spec

**Verified:** 2026-06-19 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/write-spec`

## Step 1 — Consult the Roadmap (if present)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null
```
If it exists, read it. Pick the first row with Status `NOT_STARTED` — the **walking skeleton**
if nothing is created yet, otherwise the next dependency-unblocked row. Use that row's Name,
Epic, and Depends-On to pre-fill the spec's title and the `**Epic:**` / `**Depends on:**` fields.
If no roadmap exists, proceed ad hoc (a single standalone spec).

## Step 2 — Get Next Spec Number
```bash
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort | tail -1
```
Increment by 1. Start at SPEC-001 if none. (`ROADMAP.md` is CAPS, so the `grep SPEC-` is unaffected.)

## Step 3 — Write the Spec
Save to: `docs/product-specs/draft/SPEC-XXX-{slug}.md`

```markdown
# SPEC-XXX — {Feature Name}

**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** —
**Epic:** —          <!-- from ROADMAP.md row, if roadmap-driven -->
**Depends on:** —    <!-- from ROADMAP.md row, if roadmap-driven -->

---

## Problem Statement
{what problem, who has it, why it matters}

## What We're Building
{the solution at high level}

## Core Entities
| Entity | Purpose |
|---|---|

## API Endpoints
{METHOD /path — description}

## Business Rules
{numbered list}

## State Machine (if applicable)
{ASCII diagram + transition rules}

## Non-Functional Requirements
{performance, rate limits, auth, coverage targets}

## Out of Scope (v1)
{what is NOT being built}

## Acceptance Criteria
- [ ] **AC-1:** {testable, specific criterion — one observable behavior}
- [ ] **AC-2:** {each criterion maps to exactly one acceptance test}
```

Every criterion **must** carry a stable `AC-N` id (`AC-1`, `AC-2`, …). These ids are the
traceability key: each becomes a failing acceptance test that carries the id, and the gate
grades the spec by them. Number them sequentially; never renumber once written.

## Step 3b — Scaffold Failing Acceptance Tests (the holdout)

`tests/acceptance/` is a **holdout**: the post-write hook blocks edits there outside this
spec phase, so it may only be written now, under the unlock marker. For the spec you just
wrote:

```bash
mkdir -p .rigel
touch .rigel/acceptance.unlock          # unlock the holdout for scaffolding
mkdir -p tests/acceptance/SPEC-XXX
```

**AC-id ↔ test convention (deterministic).** For **every** `AC-N` in the spec, write one
file `tests/acceptance/SPEC-XXX/test_ac_<N>.py` where:

- the **module docstring** carries the token `AC-N` (this is the declared home of the id), and
- each test function is named `test_ac_<N>_*`.

The matcher credits an AC to a test when `AC-N` appears in the file source (docstring) **or**
is normalisable out of the file/function name (`test_ac_1.py` / `test_ac_1_*` → `AC-1`, since
Python identifiers can't contain `-`). Put the id in **both** places so the static gate (file
scan) and the green vector (JUnit XML from pytest) agree.

```python
# tests/acceptance/SPEC-XXX/test_ac_1.py
"""AC-1: user can create an application."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_ac_1_post_applications_returns_201(async_client: AsyncClient) -> None:
    # Assert the REAL intended behavior. It must FAIL now (endpoint/behavior does not
    # exist yet) — that is the red-green proof. Never write a placeholder like
    # `assert False` or `assert True`; assert what "done" actually looks like.
    res = await async_client.post(
        "/v1/applications",
        json={"company": "Acme", "role": "Engineer"},
        headers={"Authorization": "Bearer <test-token>"},
    )
    assert res.status_code == 201
    assert "id" in res.json()["data"]
```

Rules for each scaffolded test:
- It carries its `AC-N` id (docstring + `test_ac_<N>.py` filename + `test_ac_<N>_*` function).
- It asserts the **real** behavior the AC describes, so it fails for the RIGHT reason before
  implementation — not `assert False`, not a snapshot (`assert x == snapshot`), not
  `assert True` (the assertion-integrity gate rejects those).

Then close the holdout and record the red-green proof:

```bash
rm -f .rigel/acceptance.unlock                            # re-lock the holdout
uv run python scripts/redgreen_record.py SPEC-XXX        # requires ALL acceptance tests to fail now
```

`redgreen_record.py` refuses to proceed if any acceptance test passes before implementation
(a test that already passes proves nothing). It writes `.rigel/redgreen/SPEC-XXX.json`. If it
fails, fix the offending test so it genuinely asserts unbuilt behavior, then re-run it.

**Always remove `.rigel/acceptance.unlock` when done** — leaving it in place would defeat the
holdout. If any step above errors out, still run `rm -f .rigel/acceptance.unlock`.

## Step 4 — Update Index + Roadmap
Add row to `docs/product-specs/index.md`: `| SPEC-XXX | {Name} | DRAFT | — | YYYY-MM-DD |`
If this spec came from a `ROADMAP.md` row, flip that row: `Spec ID: — → SPEC-XXX` and
`Status: NOT_STARTED → DRAFT` (mirrors how `/write-plan` updates the spec + index together).

## Step 5 — Tell the Human
```
Spec written:      docs/product-specs/draft/SPEC-XXX-{slug}.md   (Status: DRAFT)
Acceptance tests:  tests/acceptance/SPEC-XXX/  (N tests, all red — proof recorded)

Review it. When satisfied:
  1. Move to: docs/product-specs/ready/SPEC-XXX-{slug}.md
  2. Change Status: DRAFT → READY
  3. Run /write-plan

A spec may not go DRAFT → READY until its acceptance tests exist and their red-green
proof is recorded (.rigel/redgreen/SPEC-XXX.json) — /write-plan enforces this and
refuses to plan a spec that lacks them. Claude will not create a plan until the spec
is in ready/.
```
