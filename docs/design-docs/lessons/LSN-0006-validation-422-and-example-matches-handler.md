---
id: LSN-0006
summary: "Validation errors map to 422, and a rule's example status code must match the shipped handler."
status: DISTILLED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: null
---
## What went wrong
`testing.md` asserted `422` for an invalid body, but the generated errorHandler mapped a Zod
validation error to `400` (DF-35). Following the rule verbatim failed against the scaffold's own
handler — the doc and the code disagreed.

## Why it happens
A rule that carries a concrete example (a status code, a shape) is code-adjacent: when the
implementation drifts from the example, the rule actively misleads.

## The rule
Validation errors are 422 (Unprocessable Entity). A rule's worked example must match the shipped
handler; if they can differ, a test should pin them together.
