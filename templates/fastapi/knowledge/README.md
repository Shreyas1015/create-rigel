# knowledge/

Company knowledge this service needs but **cannot derive from its own code**: what the business
does, what domain words mean, and which other services exist.

It arrives from your company layer via `rigel update` — see `docs/company-level.md`. On a
standalone project it stays empty, and that is fine.

```
business/company.md          what the company does, who pays
business/capabilities/*.md   a capability, its owner, its KPI, which services implement it
domain/glossary/*.md         one term per file, ANCHORED to real code
domain/contexts/<this>.md    this service's bounded context (only its own — not other services')
map/services.json            GENERATED index of every service: provides / consumes / deps
```

## The rule for what goes here

**Can an agent derive it from this repo?** If yes — a folder layout, a dependency list — don't write
it down: it rots, and the evidence says overviews don't help anyway. If no — business purpose,
domain meaning, cross-repo edges — it must be written down or it is lost.

## Anchoring

Every glossary term names something real, and `make knowledge` checks it still exists:

```markdown
---
term: Shipment
anchors:
  - path: src/models/shipment.py
  - symbol: Shipment
---
A **Shipment** is a physical movement of goods. It is NOT an Order (the commercial
agreement). One Shipment may fulfil many Orders.
```

Anchor the **model class** in `src/models/` (`class Shipment(Base):`), not the router — the router
is transport, the model is the word. Anchors resolve against `src/`.

Rename the model without updating this and the check reports it. A wiki rots in silence; anchored
knowledge rots loudly.

## Running the check

```bash
make knowledge                              # advisory — prints stale anchors, always exits 0
node scripts/rigel-knowledge.mjs --strict   # exits 1 on a dead anchor
```

**This one check is Node, not Python** — unlike `scripts/rigel_verify.py`, which is ported because
`scripts/gate.sh` depends on it. The anchor resolver is language-agnostic (it reads markdown
frontmatter and greps source text for a definition, in any language), so it ships once as
`scripts/rigel-knowledge.mjs` and `scripts/lib/rigel-knowledge-lib.mjs` for every stack. Nothing
here runs under `uv run`.

That makes **node an optional dependency of this repo**: if node is absent, `make knowledge` fails
to start and nothing else is affected. The check is deliberately **not** in `scripts/gate.sh` — it
is advisory this release (a new gate that misfires even once teaches everyone to ignore it), and a
missing interpreter must never be able to fail your gate.
