---
name: 06-push-layer
description: /push-layer — Commit and Push Current Layer
verified: 2026-06-04
libraries: []
source: git
note: Process skill — git operations only, no library dependencies.
---

# /push-layer — Commit and Push Current Layer

Triggered by: `/push-layer`
Called automatically by /build-layer after gate passes.
Can be called manually if needed.

---

## Steps

1. Check gate status:
   ```bash
   # Run quick gate check before allowing push
   npx tsc --noEmit && npx eslint src/ --max-warnings=0
   ```
   If either fails → abort and tell human to fix or run `/build-layer`

2. Stage all changes:
   ```bash
   git add -A
   git status  # show what's being committed
   ```

3. Determine commit message from active plan:
   - Read plan → find most recently completed layer
   - Format: `{type}({layer}): {description}`

4. Commit:
   ```bash
   git commit -m "{conventional commit message}"
   ```

5. Push:
   ```bash
   git push origin $(git branch --show-current)
   ```

6. Report:
   ```
   Pushed: {commit hash} — {message}
   Branch: {branch name}
   ```

## Conventional Commit Types
- `feat` — new feature layer (types, service, runtime)
- `chore` — infrastructure, config, migrations
- `test` — test layer
- `refactor` — refactoring existing layer
- `fix` — fixing a bug in existing layer
- `docs` — documentation only
