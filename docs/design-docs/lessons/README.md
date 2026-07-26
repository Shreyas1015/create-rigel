# Rigel's own lessons (dogfood memory)

These are **create-rigel's own** development lessons — distilled from the 48 dogfood findings
(DF-1..48, see `docs/exec-plans/dogfood-findings.md`) and the banked doctrine. They are the
maintainer's memory of how to build good templates, not lessons that ship to consumers (the
learning *mechanism* ships in each template's `docs/design-docs/`; a consumer's lessons are about
their own project).

Seeded class-by-class, not one-per-finding: most of the 48 findings are *instances*; only the
~12 that generalise (would catch a future, different instance) are here. Many were born already
`ENFORCED` — Rigel had already turned them into gate rules, hooks, or branch protection — which is
the whole thesis: **memory is a staging area for gate rules, not a library of prose.**
