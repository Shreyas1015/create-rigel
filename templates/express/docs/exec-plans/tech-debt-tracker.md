# Technical Debt Tracker

Debt is logged here immediately when created. Never ignored until it's a crisis.
Paid in small daily amounts.

---

## Severity

| Level | Meaning | Fix by |
|---|---|---|
| P0 | Security or data integrity risk | Immediately |
| P1 | Blocks future feature or causes recurring bugs | Within 2 sprints |
| P2 | Degrades quality or velocity | Within the quarter |
| P3 | Code smell, DX improvement | When in the area |

---

## Open Debt

| ID | Severity | Area | Description | Created By | Date |
|---|---|---|---|---|---|
| TD-001 | P2 | tests/architecture | The AST assertion checker imports the TypeScript compiler API (`import ts from 'typescript'` in `tests/architecture/assertion-integrity.test.ts`). The TS7 native (Go) compiler rewrite drops the JS API, so this test breaks under TS7. **Dormant:** ts-jest peer ranges + create-next-app pin scaffolds to TS5. **Trigger:** adopting TS7. **Affected:** `tests/architecture/assertion-integrity.test.ts`. | PLAN-006 AC-3 | 2026-07-20 |

---

## Resolved Debt

| ID | Description | Resolved By | Date |
|---|---|---|---|
| *(none yet)* | — | — | — |
