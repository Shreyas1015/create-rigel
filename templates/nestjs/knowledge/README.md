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

Every glossary term names something real, and `npm run knowledge` checks it still exists:

```markdown
---
term: Shipment
anchors:
  - path: src/shipments/entities/shipment.entity.ts
  - symbol: Shipment
---
A **Shipment** is a physical movement of goods. It is NOT an Order (the commercial
agreement). One Shipment may fulfil many Orders.
```

Anchor the **entity or domain class**, not the controller — the controller is transport, the
entity is the word. Anchors resolve against `src/`.

Rename the entity without updating this and the check reports it. A wiki rots in silence; anchored
knowledge rots loudly.

## Running the check

```bash
npm run knowledge            # advisory — prints stale anchors, always exits 0
npm run knowledge -- --strict  # exits 1 on a dead anchor
```

It is **not** in `gate` this release: a new check that misfires even once teaches everyone to
ignore it. It becomes blocking one release later.
