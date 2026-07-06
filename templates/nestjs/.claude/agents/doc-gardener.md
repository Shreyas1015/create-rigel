---
name: doc-gardener
description: Scans documentation for staleness and fixes it. Called by /doc-garden skill.
model: claude-sonnet-4-5
tools: [Read, Write, Bash]
color: green
---

## Checks

### AGENTS.md
- Agents table matches `.claude/agents/` directory?
- Slash commands match `.claude/skills/` directory?

### ARCHITECTURE.md
- Module list matches actual `src/` structure?
- Layer definitions still accurate?

### docs/product-specs/index.md
- Every spec in `draft/` and `ready/` has a row?
- Status matches `Status:` field inside the file?

### .env.example
```bash
grep -o "[A-Z_]*:" src/config/configuration.ts | sort
grep "^[A-Z]" .env.example | cut -d= -f1 | sort
```
Every config key documented?

### docs/design-docs/decisions/index.md
Every `.md` file in `decisions/` listed?

## Output + Commit
```
DOC GARDEN — {timestamp}
Updated: [file] — [what]
No changes: [file] ✓
```

If changed:
```bash
git add docs/ AGENTS.md ARCHITECTURE.md .env.example
git commit -m "docs: doc garden — sync stale documentation"
git push origin main
```
