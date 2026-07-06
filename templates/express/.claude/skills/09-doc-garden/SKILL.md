---
name: 09-doc-garden
description: /doc-garden — Scan and Fix Stale Documentation
verified: 2026-06-04
libraries: []
source: AGENTS.md
note: Process skill — documentation sync, no library dependencies.
---

# /doc-garden — Scan and Fix Stale Documentation

Triggered by: `/doc-garden`

---

## What It Checks

### 1. AGENTS.md
- Lists all skills that exist in `.claude/skills/`?
- Lists all agents that exist in `.claude/agents/`?
- Navigation table matches actual `docs/` structure?

### 2. ARCHITECTURE.md
- Layer definitions match what's actually in `src/`?
- Directory structure example is current?

### 3. docs/product-specs/index.md
- Every spec file in `draft/` and `ready/` has a row?
- Status column matches actual file status?

### 4. docs/exec-plans/tech-debt-tracker.md
- RESOLVED items not cluttering the open list?

### 5. docs/design-docs/decisions/index.md
- Every ADR file in `decisions/` is listed?

### 6. .env.example
- Every variable in `src/config/env.ts` EnvSchema has a row in `.env.example`?

## Steps
For each stale item found:
1. Update the document to match reality
2. Note what was changed

## Report
```
DOC GARDEN COMPLETE — {timestamp}

Updated:
  - AGENTS.md: added {skill} to slash commands table
  - docs/product-specs/index.md: synced 2 spec statuses
  - .env.example: added {NEW_VAR} from env.ts

No changes needed:
  - ARCHITECTURE.md ✓
  - tech-debt-tracker.md ✓
```

Commit if anything changed:
```bash
git add docs/ AGENTS.md ARCHITECTURE.md .env.example
git commit -m "docs: doc garden — sync stale documentation"
git push origin main
```
