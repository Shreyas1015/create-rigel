# Design Workflow — tokens, enforcement, and the optional Figma connector

This project's design system is **enforced from the repo, not remembered**. The layers:

| Layer | Owns | Enforced by |
|---|---|---|
| `tokens.json` (DTCG) | Design **values** (color, spacing, radius, type) — the single source of truth | Style Dictionary builds `src/app/tokens.css` (`@theme`) |
| `DESIGN.md` | Design **meaning** (audience, lane, voice, anti-references) | `npm run design:drift` (no literal values allowed here) |
| eslint-plugin-tailwindcss | Token discipline in code (no arbitrary values, no off-token classes) | the gate `lint` (errors) |
| `tests/design/token-conformance` | Rendered output matches `tokens.json` | Playwright, reads `tokens.json` |
| Impeccable | AI-slop / craft anti-patterns | `post-write` hook (slop blocks) + `waivers:check` |
| vision-judge | Layout sanity only (advisory) | agent, non-blocking |

## The boundary: the repo is authoritative, Figma is not

> **`tokens.json` in this repository is the single source of truth for design values.**
> Figma is an **optional** import/export peer, **never** authoritative. Nothing in the build,
> the gate, or CI reads Figma; they read `tokens.json`. A design change is only real once it
> lands in `tokens.json` via a reviewed PR — a change that exists only in Figma "doesn't exist"
> (the cardinal rule). This keeps design mechanically reproducible and offline.

## Optional: Figma Dev Mode MCP connector

The [Figma Dev Mode MCP server](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
lets Claude Code read design context from, and push generated UI back to, Figma. It is **opt-in**
and requires a Figma plan with Dev Mode / a Dev seat — so it is **not a dependency** of this
template. Enable it only if your team already uses Figma.

Add it to your Claude Code MCP config (e.g. `.mcp.json`), per Figma's guide, then use these tools:

### 1. Variables → `tokens.json` (import path)
- `get_variable_defs` extracts the variables/styles (color, spacing, typography) in a Figma
  selection.
- **Map them into `tokens.json`** (DTCG: primitives + semantics), then run `npm run tokens:build`.
- This is a **reviewed import**, not a sync: Figma proposes, `tokens.json` decides. Open a PR;
  the token-conformance check and eslint then enforce the new values regardless of Figma.

### 2. Code Connect (component mapping)
- `get_code_connect_map` maps Figma component/instance node IDs to the React components in
  `src/components` / `src/features`, so generated code reuses your real components instead of
  re-inventing markup. Configure Code Connect per Figma's
  [Code Connect setup](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-generate-library/references/code-connect-setup.md).

### 3. `generate_figma_design` (reverse path)
- `generate_figma_design` sends live rendered UI back to Figma as design layers — useful to keep
  a Figma library in step with what shipped. This is **export only**; it never makes Figma the
  source of truth. New files land in your team/org drafts; editing existing files needs edit
  permission.

## Everyday flow

```
edit tokens.json  →  npm run tokens:build  →  @theme updates  →  components use bg-primary etc.
/build-layer      →  post-write blocks slop (Impeccable) + hook checks
npm run gate      →  lint (token discipline) · token-conformance · waivers:check · design:drift
```

**Sources:** [Figma Dev Mode MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/) ·
[Figma MCP guide](https://github.com/figma/mcp-server-guide) ·
[Introducing the Dev Mode MCP server](https://www.figma.com/blog/introducing-figma-mcp-server/)
