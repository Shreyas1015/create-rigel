# /push-layer — Commit and Push Current Layer

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/push-layer`

## Steps

1. Quick gate check before push:
```bash
uv run ruff check src/ && uv run mypy src/
```
If fails → abort, tell human to fix or run `/build-layer`.

2. Stage + commit:
```bash
git add -A
git status
git commit -m "{conventional commit message from active plan}"
```

3. Push:
```bash
git push origin $(git branch --show-current)
```

4. Report: `Pushed: {hash} — {message}`

## Conventional Commit Types
`feat` · `chore` · `test` · `refactor` · `fix` · `docs`
