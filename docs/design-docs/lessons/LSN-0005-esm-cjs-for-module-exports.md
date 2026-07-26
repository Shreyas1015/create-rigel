---
id: LSN-0005
summary: "In an ESM package (\"type\":\"module\"), files that use module.exports (migrations, CLI config) must be .cjs."
status: DISTILLED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: null
---
## What went wrong
A `.js` Sequelize migration in a `"type":"module"` package was parsed as ESM, so its
`module.exports` threw "module is not defined in ES module scope" and `db:migrate` failed (DF-22).

## Why it happens
`"type":"module"` makes `.js` mean ESM. Any file authored with CommonJS `module.exports` must
carry the `.cjs` extension to be parsed as CommonJS.

## The rule
Migrations and CLI configs that use `module.exports` are `.cjs`, not `.js`, in an ESM package.
(Candidate for enforcement: a grep for `module.exports` in `**/*.js` under an ESM package.)
