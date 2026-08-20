# /push-layer — Commit and Push Current Layer

Triggered by: /push-layer

## Steps
1. Run the full gate (Cardinal Rule 4 — gate must PASS before commit):
```bash
npm run gate   # typecheck + lint + format:check + test:coverage (incl. tests/architecture/)
```
If it fails → auto-fix what you can, re-run, and only proceed when green. Never commit a red gate.

2. Commit:
```bash
git add -A
git commit -m "{type}({scope}): {description from active plan}"
git push origin $(git branch --show-current)
```

## Commit Types
feat · fix · chore · refactor · test · docs · style · perf
