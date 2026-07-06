# /doc-garden — Scan and Fix Stale Docs

Triggered by: /doc-garden

Calls doc-gardener agent which checks:
- AGENTS.md vs .claude/ directory
- ARCHITECTURE.md vs actual src/ structure
- docs/product-specs/index.md vs actual spec files
- .env.example vs src/lib/env.ts schema
- docs/design-docs/decisions/index.md vs actual ADR files

Updates anything stale. Commits if changed.
