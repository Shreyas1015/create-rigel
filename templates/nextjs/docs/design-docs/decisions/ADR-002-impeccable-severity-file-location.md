# ADR-002 — Impeccable severity tiering lives in a Rigel-owned file, NOT `.impeccable/config.json`

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** PLAN-005 (Design Enforcement Stack)

---

## Context
Impeccable's detector has no native per-rule severity tiers. Rigel needs to split findings
into **slop** (AI-tell antipatterns → BLOCK the write) and **craft** (quality → advisory).
That slop/craft map is Rigel's configuration and must live *somewhere*.

The obvious-looking home is `.impeccable/config.json` — it sits right there and already
holds detector settings (`detector.ignoreRules`, etc.). **It is the wrong home.**

## Decision
Keep Rigel's severity tiering in a **Rigel-owned file**: `.claude/hooks/impeccable-severity.json`.
Use `.impeccable/config.json` only for what Impeccable itself owns (here: `ignoreRules` that
turn off the token-value rules the eslint/token-conformance layers already cover).

## Why — do NOT consolidate these two files
`.impeccable/config.json` is **owned and rewritten by Impeccable**: `impeccable ignores add-*`
(and related commands) rewrite that file. If Rigel's `slopRules` lived there, the next
`impeccable ignores` invocation would **silently erase it**. The failure mode is nasty and
invisible: slop rules would quietly demote from blocker to nothing, the gate would still pass,
and nothing would look broken — exactly the kind of silent enforcement rot the whole design
stack exists to prevent.

This split looks like needless duplication and *invites* a "let me consolidate these" refactor.
**That refactor reintroduces the bug.** This ADR exists to stop it.

Generalizable rule: **a config file that a third-party tool owns and rewrites cannot hold your
own configuration** — keep yours in a file you own and have the tool's config reference/ignore
yours, never the reverse.

## Consequences
- Two design-config files coexist by design: `.impeccable/config.json` (Impeccable's, may be
  rewritten by its CLI) and `.claude/hooks/impeccable-severity.json` (Rigel's, hand-owned).
- `impeccable-tier.mjs` reads the Rigel file for the slop set; `impeccable` never touches it.
- Promotion/demotion of a rule's severity is edited in the Rigel file, safe from CLI rewrites.
