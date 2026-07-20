# Technical Debt Tracker

## Severity
| Level | Fix by |
|---|---|
| P0 | Immediately — security/XSS/token exposure |
| P1 | Within 2 sprints — blocks features or causes bugs |
| P2 | Within quarter — degrades quality or DX |
| P3 | When in area — code smell |

## Open Debt
| ID | Severity | Area | Description | Created By | Date |
|---|---|---|---|---|---|
| TD-001 | P2 | tests/architecture | The AST assertion checker imports the TypeScript compiler API (`import ts from 'typescript'`, written by `/infra-setup` into `tests/architecture/assertion-integrity.test.ts`). The TS7 native (Go) compiler rewrite drops the JS API, so this test breaks under TS7. **Dormant:** create-next-app pins to TS5. **Trigger:** adopting TS7. **Affected:** `tests/architecture/assertion-integrity.test.ts`. | PLAN-006 AC-3 | 2026-07-20 |

## Resolved Debt
| ID | Description | Resolved By | Date |
|---|---|---|---|
| *(none yet)* | — | — | — |
