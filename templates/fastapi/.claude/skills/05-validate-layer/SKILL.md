# /validate-layer — Run Gate Without Building

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/validate-layer`

Calls `gate-checker` agent on current state of `src/`. Read-only — no auto-fix.

## Steps
1. Find most recently checked layer from active plan
2. Call `gate-checker` agent with that layer name
3. Present full PASS/FAIL report

```
VALIDATION REPORT — Layer: {name}
{full gate output}

Read-only validation. To auto-fix: run /build-layer
```
