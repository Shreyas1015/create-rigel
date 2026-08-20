# /layer-check — Ad-hoc Architecture Violation Scan

Triggered by: /layer-check

Runs:
1. npm run typecheck
2. npm run lint
3. grep for direct fetch() in components/features/pages
4. grep for process.env outside env.ts
5. grep for console.log
6. grep for raw <img> tags
7. file size check (> 400 lines)
8. npx vitest run tests/architecture/

Output:
```
LAYER CHECK — {timestamp}
TypeScript:  CLEAN / {N} errors
ESLint:      CLEAN / {N} errors
fetch():     NONE / {list}
process.env: NONE / {list}
console.log: NONE / {list}
<img>:       NONE / {list}
File sizes:  NONE / {list}
Arch tests:  PASS / FAIL

OVERALL: CLEAN / {N} violations
```
