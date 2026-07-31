---
paths: ["src/**"]
---

# Acme security rules

- Never log an email address, phone number, or full name. Use the user id.
  Enforced by `eslint-rules/no-pii-in-logs.cjs` — this rule explains the failure.
- All outbound HTTP goes through `src/providers/http.ts` (it carries the trace context).
