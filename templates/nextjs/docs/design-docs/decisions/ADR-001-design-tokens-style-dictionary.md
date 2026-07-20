# ADR-001 — Design tokens: DTCG + Style Dictionary v4

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** PLAN-005 (Design Enforcement Stack)

---

## Context
`tokens.json` is the single source of truth for design values (color, spacing, radius,
type). It must build into a Tailwind v4 `@theme` block so the values drive real utilities,
and it must be a standard, tool-agnostic format so it can round-trip with design tools.

- **DTCG format.** The W3C Design Tokens Community Group published its first stable format
  (2025.10) on 2025-10-28 (`$value`/`$type`, `{alias}` references) — a real, tool-agnostic
  standard, so tokens can round-trip with design tools.
- **Style Dictionary version.** v4 and v5 are both current; Rigel installs deps unpinned
  (latest stable), so the config must not depend on a specific major.

## Decision
Author tokens in **DTCG** and build with **Style Dictionary, unpinned** (latest stable).

- The config uses only **version-tolerant** APIs: `usesDtcg` (auto-detected), the built-in
  `css` transform group, and a custom format. It was verified to build **identical** `@theme`
  output on **v4.4 and v5.5** (end-to-end `/infra-setup` installs whatever is current — v5.5.0
  at the time of writing — and produces correct output). So we do NOT pin a major.
- A custom SD format emits a Tailwind v4 `@theme { }` block; a `filter` drops the internal
  `primitive` tier so only semantic tokens become utilities (components never reference
  primitives directly).
- Output `src/app/tokens.css` is `@import`-ed into shadcn's `globals.css` so Tailwind
  processes the `@theme`. Verified with the real Tailwind v4 engine: token utilities
  (`bg-primary`, `rounded-md`, …) are generated from the imported theme.

## Consequences
- `tokens.json` edits require `npm run tokens:build` to regenerate `src/app/tokens.css`.
- Unpinned per Rigel convention: a future Style Dictionary major could change the format/
  transform API. The Skill Freshness Check covers this; if a major breaks the config, adjust
  the custom format (it is small and self-contained) rather than reverting the SoT.
- The deterministic `token-conformance` check reads `tokens.json` directly (see AC-6), so the
  same source of truth drives both the generated theme and the rendered-output check.
