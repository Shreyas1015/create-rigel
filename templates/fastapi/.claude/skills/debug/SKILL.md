---
name: debug
description: /debug — structured debugging loop when the same gate failure repeats
verified: 2026-07-27
libraries: []
source: docs/design-docs/memory.md
note: Process skill. Invoked by /build-layer when a layer fails the gate on the SAME error twice.
---

# /debug — The fix is never "try harder"

Triggered by: `/debug`, and **automatically by `/build-layer`** when a layer fails the gate twice
with the **same failure signature**.

A second identical failure means the first fix was a guess. Guessing again is the failure mode this
skill exists to stop. From here you work by **hypothesis, not by attempt** — and the loop is
enforceable because Rigel's gate is ground truth: it says exactly what broke, where, every run.

**Forbidden throughout (these are not fixes):**
- Changing the same code again "differently" without a stated hypothesis.
- Weakening the gate, lowering a threshold, adding a `# noqa` / `# type: ignore`, or marking a test
  `@pytest.mark.skip` / `xfail`.
- Deleting or editing the acceptance test that's failing (the holdout hook blocks this anyway).
- Broad "shotgun" edits touching several files at once to see what sticks.

---

## Step 1 — Restate the failure exactly

Take it verbatim from the gate output. No paraphrasing.

```bash
cat .rigel/gate-failures.jsonl | tail -5     # signature + message + file:line, as recorded
```

Write down: the **signature**, the **file:line**, and the **exact message**. If you cannot name all
three, you do not yet have a failure — re-run the gate and read it.

## Step 2 — State ONE falsifiable hypothesis

Write it in this shape, in the plan's Decision Log:

```
HYPOTHESIS (attempt N): <the specific cause>
  → because: <the evidence from the gate output that points at it>
  → if true: <the exact observable that changes when I fix it>
  → if false: <what I'd see instead>
```

A hypothesis that can't be wrong isn't a hypothesis ("something's off in the config" is not one).
If you have two candidate causes, pick the one the evidence most supports and note the other as the
next hypothesis — test them **one at a time**.

## Step 3 — Reproduce it minimally

Find the smallest command that shows the failure. Not the whole gate — the one check.

```bash
uv run ruff check src/                                      # ruff:* signatures
uv run mypy src/                                            # mypy:* signatures
uv run bandit -r src/ -ll -q                                # bandit:* signatures
uv run pytest tests/unit/services/application_service_test.py::test_name   # one test
```

A shorter reproduction is a faster loop and it isolates the variable. If you cannot reproduce it in
isolation, that is itself information: the failure is environmental or order-dependent — say so and
form a hypothesis about *that* instead. (In this stack, a test that passes alone but fails in the
suite is usually a leaked async session/event loop or a fixture with the wrong scope — that's a
hypothesis, so state it as one, and `uv run pytest <the-one-file>` vs the full run tells you.)

### Step 3b — Turn the reproduction into a failing test, and prove it red

**Do this BEFORE the fix.** A test written afterwards has never been observed failing, so it may
assert nothing at all — that is the same false-green this repo already rejects for acceptance tests.

```bash
# write the test so it FAILS on the bug as it exists right now, then:
python3 scripts/debug_regression.py red <signature> --test tests/regression/test_<name>.py
```

It refuses a test that already passes. Once red is recorded, the fix has something to turn green,
and `npm run gate` will not let this signature go untested.

## Step 4 — Verify the hypothesis against the gate (free ground truth)

Most systems ask an LLM to guess whether the diagnosis is right. Here the gate answers. Make the
**smallest possible change** that the hypothesis predicts will work, then re-run the minimal
reproduction from Step 3.

- **It passes** → the hypothesis is confirmed. Run the FULL gate to check you broke nothing else.
- **It still fails** → the hypothesis is **falsified**. Revert the change. Do not layer a second
  guess on top of a failed one — go back to Step 2 with what you just learned (that's progress, not
  a wasted attempt).

## Step 5 — Confirm, then record

Once the full gate passes:

```bash
make gate          # == bash scripts/gate.sh
```

Record the failure so the memory loop can count it — even though it's now fixed. Recurrence across
plans is exactly the signal `/curate` needs:

```bash
python3 scripts/record_failure.py <signature> "<message>" <file:line>
```

Then close the loop — the test from Step 3b must now pass:

```bash
python3 scripts/debug_regression.py green <signature>
```

This is not bookkeeping. `npm run gate` runs `debug:regression check`, and **any signature that has
failed twice without a regression test proven red→green fails the build.** A recurring bug with no
test will come back; this is what stops it.

## Step 6 — Distill (only if it generalises)

Ask the one question that separates a lesson from an instance:

> **Would this root cause bite a future, DIFFERENT case** — another file, feature, or layer?

- **Yes** → it's a class. `/curate` will pick it up from the recorded signature at
  `/garbage-collect`; add the root cause to the lesson's "Why it happens" while it's fresh.
- **No** → it was a one-off. Leave it in the plan's Decision Log and move on. Do **not** create a
  lesson for it — false lessons cost more than missing ones.

## Step 7 — Stop rule (escalate honestly)

After **3 falsified hypotheses** on one failure, stop and hand it to the human with:

```
BLOCKED: <signature> at <file:line>
Tried: H1 <hypothesis> → falsified by <observation>
       H2 <hypothesis> → falsified by <observation>
       H3 <hypothesis> → falsified by <observation>
Minimal reproduction: <the command>
What I'd need to proceed: <the specific unknown>
```

Three falsified hypotheses is a real result, not a failure to report — it means the cause is
outside what the gate can see. Presenting it beats a fourth guess.
