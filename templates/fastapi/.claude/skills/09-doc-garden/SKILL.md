# /doc-garden — Scan and Fix Stale Docs

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/doc-garden`

Calls `doc-gardener` agent. Checks AGENTS.md, ARCHITECTURE.md, specs index,
.env.example vs settings.py, decisions index. Updates what's stale. Commits if changed.
