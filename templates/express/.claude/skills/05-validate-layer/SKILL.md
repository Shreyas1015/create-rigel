---
name: 05-validate-layer
description: /validate-layer — Run Gate Check Without Building
verified: 2026-06-04
libraries: []
source: .claude/agents/gate-checker.md
note: Process skill — delegates to gate-checker agent, no library dependencies.
---

# /validate-layer — Run Gate Check Without Building

Triggered by: `/validate-layer`
Use ad-hoc to check any layer at any time.

---

## What It Does
Calls the `gate-checker` agent on the current state of `src/`.
Does NOT build anything. Does NOT commit anything.
Useful for: checking state mid-build, verifying after manual edits.

## Steps

1. Determine which layer to check:
   - Read `docs/exec-plans/active/PLAN-XXX.md`
   - Find the most recently checked layer (last `[x]`)
   - Or ask the human: "Which layer do you want to validate?"

2. Call `gate-checker` agent with the layer name

3. Present the full PASS/FAIL report

4. If FAIL: list items but do NOT auto-fix (this is an inspection tool)
   - To auto-fix: run `/build-layer` which includes auto-fix logic

## Output
```
VALIDATION REPORT — Layer: {name}
{full gate output}

This was a read-only validation.
To auto-fix failures: run /build-layer
```
