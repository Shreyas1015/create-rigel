---
id: LSN-0011
summary: "Import models through the registration barrel that runs addModels — never the raw model file."
status: DISTILLED
seen: 1
first_seen: PLAN-006
last_seen: PLAN-006
signatures: []
enforced_by: null
---
## What went wrong
Importing a model from its file (`../models/Foo.model`) instead of the `src/models` barrel bypassed
`sequelize.addModels([...])`, so the first query threw `Model not initialized` (DF-31).

## Why it happens
Registration is a side effect of the barrel's module load. A direct file import gets the class
without the registration that makes it usable.

## The rule
Repos/services import models from the `src/models` barrel (which runs `addModels`), never the model
file directly. (Candidate for enforcement: an eslint `no-restricted-imports` on `**/models/*.model`.)
