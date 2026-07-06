# /validate-layer — Run Gate Without Building

Triggered by: /validate-layer

Calls gate-checker agent on current src/ and app/ state.
Read-only — no auto-fix, no commit.

## Steps
1. Find most recently checked layer from active plan
2. Call gate-checker agent
3. Present full PASS/FAIL report

To auto-fix failures: run /build-layer
