# DESIGN — Brand & Design Meaning

> This file owns design **meaning** — who the product is for, the lane it's in, its voice,
> and what to avoid. It does NOT own design **values**: every color, spacing, radius, and
> type value lives in `tokens.json` (the single source of truth), which Style Dictionary
> builds into `src/app/tokens.css` (@theme). Impeccable and the vision-judge read this file
> for brand context; the deterministic token-conformance check reads `tokens.json`.
>
> RULE (enforced by `npm run design:drift`): do NOT write literal color / spacing / radius
> values here — no raw hex codes, no rgb or hsl color functions, no numeric pixel lengths.
> Reference token names instead: use the token `--color-primary`, never the raw value it
> resolves to.

## Audience

Who this product is for. _(e.g. "Operators at mid-market logistics firms — time-poor, data-dense.")_

## Lane / Positioning

The design lane. _(e.g. "Calm, precise, utilitarian — closer to Linear than to a consumer marketing page.")_

## Voice & Tone

How the UI and copy speak. _(e.g. "Direct, concrete, no hype. Verbs over adjectives.")_

## Anti-references (what to avoid)

Concrete off-brand tells. _(e.g. "No purple SaaS gradients, no bounce animation, no hero
eyebrow chips, no dark glows." These overlap the Impeccable slop rules that block on write.)_

## Values

All design values are tokens — see [`tokens.json`](tokens.json). To change a color, space,
radius, or type step, edit `tokens.json` and run `npm run tokens:build`. Never hard-code
values in components (enforced by eslint-plugin-tailwindcss) or list them here (enforced by
`npm run design:drift`).
