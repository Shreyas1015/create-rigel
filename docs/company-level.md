# Running Rigel at company level

Rigel scaffolds a project once. That is useful for one person. For a company you need three more
things, and this is how they work.

| | What it is |
|---|---|
| **A company layer** | one git repo holding your organisation's overlay on a Rigel template |
| **A manifest** | `.rigel/manifest.json` in every service — the return address |
| **`update` + `verify`** | how the layer reaches those services, and how CI proves it stuck |

Without the manifest, a repo is unreachable: no updates, no verification. A scaffold writes it on
day 0. An existing repo gets one from `npx create-rigel adopt`, which places the harness **additively**
— any file that was already there is declined, recorded in `manifest.baseline`, and never owned or
rewritten. What adoption cannot give you retroactively is history: Rigel knows what it wrote from the
moment it arrived, not before.

---

## 1. Create a company layer

A layer is a normal git repo:

```
acme-rigel/
  rigel-layer.json     which base template it extends, plus any extra ownership globs
  managed/**           overlaid into every service repo. Rigel owns these.
  seed/**              written once at scaffold, then the team owns it.
```

```jsonc
// rigel-layer.json
{
  "name": "acme",
  "extends": "express",                       // the base Rigel template
  "ownership": { "managed": ["eslint-rules/**"] }   // protect files in new directories
}
```

There is a working example in [`examples/company-layer/`](../examples/company-layer/) — the test
suite scaffolds from it, so the format stays honest.

### What belongs in a layer

Things that can **fail a build**: lint rules, architecture tests, CI workflows, gate steps,
path-scoped agent rules. A rule of thumb straight from Rigel's cardinal rule — *if it can't fail a
build or drive a mechanical loop, it's a doc, not an agent.* Put the docs in your wiki.

> "Every service logs a request id and never logs an email address" is a paragraph nobody reads.
> `eslint-rules/no-pii-in-logs.cjs` is the same knowledge, and it stops the commit.

### `managed/` vs `seed/`

- **`managed/`** — Rigel owns it. `rigel verify` fails if it's hand-edited; `rigel update` keeps it
  current. Use it for anything that must be identical across services.
- **`seed/`** — written once if absent, never overwritten. Use it for starting points the team is
  expected to grow: an ADR-000, a README skeleton.

If your layer adds files in a directory the base template doesn't know about (like `eslint-rules/`),
list it under `ownership.managed` — otherwise those files are unowned: never updated, never verified.

---

## 2. Scaffold a service from it

```bash
npx create-rigel my-service --template gh:acme/acme-rigel#a1b2c3d   # pin the SHA
npx create-rigel my-service --template ./acme-rigel                 # while developing the layer
```

Supported: `gh:` / `github:` / `gitlab:` shorthand, any https/ssh/git/file URL, and local paths.
`#ref` accepts a branch, tag, or full commit SHA. Private repos use **your existing git
credentials** — ssh keys and credential helpers both work, with no token to configure.

**Always pin a SHA in real use.** A layer referenced by a moving branch makes every scaffold
irreproducible. The resolved URL and SHA are recorded in the service's manifest.

---

## 3. Keep services current

```bash
npx create-rigel@latest update            # in a service repo
npx create-rigel@latest update --dry-run  # show the plan, change nothing
```

`update` compares three hashes per file — what Rigel last wrote, what's there now, and what the new
version ships:

| Situation | What happens |
|---|---|
| You never touched the file | updated silently (about 90% of files) |
| You edited it, upstream didn't | left alone |
| **Both** changed | a `<file>.rigel-new` sidecar appears; **your file is untouched** |
| You deleted it | not resurrected |

Nothing is ever merged in place, so a bad merge cannot silently eat your edit. It refuses to run on
a dirty tree and never commits — the whole update lands as one reviewable `git diff`.

Resolve a conflict by diffing the sidecar, taking what you want, and deleting it. The gate fails
while any sidecar remains, so an unresolved update can't be forgotten.

---

## 4. Prove it stuck

Every service's gate runs `rigel verify`, which re-hashes the files Rigel owns and fails if any were
hand-edited. It needs no network — the manifest already records the hashes.

Deliberately, it does **not** fail because a newer `create-rigel` exists. Failing a PR because
someone else published a release is how teams learn to ignore a gate. Staleness should open a
scheduled update PR instead.

### When a team genuinely needs an exception

Add a waiver to the service's manifest:

```jsonc
"waivers": [
  { "path": ".claude/rules/security.md",
    "sha256": "<hash of the edited file>",
    "reason": "SOC2 clause added by the security team",
    "owner": "@alice",
    "expires": "2026-10-01" }
]
```

Two properties make this honest: the waiver pins the **exact content** accepted, so editing the file
further re-fires the gate; and **an expired waiver fails the build**, so a temporary exception can't
quietly become permanent.

---

## Rolling a change across many services

1. Merge the rule into `acme-rigel`, tag a SHA.
2. In each service: `npx create-rigel@latest update` → a PR per service.
3. Each PR's CI runs `rigel verify`; teams merge on their own schedule.

At 2–3 services do it by hand. Past that, a scheduled job opening the PRs is the same pattern
Dependabot uses, and it's the only approach that survives — a pinned reference that nobody is
prompted to move will simply rot.

---

## What Rigel deliberately does not do

- **No hosted service, no broker, no registry.** A layer is a git repo you already control.
- **No calendar-age build failures.** Only regenerate-and-compare, which is deterministic.
- **No prose knowledge base.** Domain and business knowledge is coming in PLAN-009, and even then
  it is anchored to real code so it fails a build when it goes stale.

---

## 4b. Anchored knowledge — prose that fails a build

A company glossary is worth having and normally rots in silence. Rigel's version can't: every term
names something real, and the gate resolves it.

```markdown
---
term: Shipment
owner: acme-billing          # ← who owns the CODE this term describes
anchors:
  - symbol: Shipment
---
A **Shipment** is a physical movement of goods. It is NOT an Order (the commercial agreement).
One Shipment may fulfil many Orders. Cancelling an Order does **not** cancel its Shipment.
```

Rename `Shipment` to `Consignment` and forget the glossary, and the build goes red. **A wiki rots
in silence; anchored knowledge rots loudly.** That is what earns prose a place in a gate-enforced
repo — it can fail a build.

### `owner:` — why it exists

The **whole** glossary goes to every service, because shared vocabulary is the entire point. But a
term's code lives in exactly one repo. Without `owner:`, `acme-web` would fail the gate for a term
it merely *reads*.

So: **everyone reads the term; only its owner is held to the anchor.** The check reports how many
anchors belong elsewhere rather than hiding them, so the skip is visible:

```
✓ rigel knowledge: 1 anchor(s) across 1 entr(ies) still resolve
  (2 anchor(s) belong to other services — read, not verified here)
```

A term with **no** `owner` is checked everywhere — a single-repo project needs no ceremony.

### Anchor types

| Anchor | Passes when |
|---|---|
| `path: src/models/Shipment.model.ts` | that file exists |
| `symbol: Shipment` | something *defines* it — `class`/`interface`/`type`/`enum`/`const`/`let`/`var`/`function`/`def`/`struct` |

A mere mention doesn't count: a comment saying *"we should add Shipment one day"* will not satisfy
an anchor, or the check would be worthless.

### Migration

The check is **blocking**. When adopting it on a repo with an existing glossary, run
`npm run knowledge -- --advisory` (or `python3 scripts/rigel_knowledge.py --advisory`) to see the
damage without a red build, fix or `owner:`-tag the entries, then drop the flag.

---

## 5. The service map — knowing what you'd break, offline

An agent in one service normally knows nothing about the others. The map fixes that without
cloning anything: each repo publishes **facts about itself**, the layer aggregates them, and
everyone gets the merged index back.

```
each service ──(rigel facts)──▶ .rigel/service.json
                                      │  committed to the layer as facts/<service>.json
                                      ▼
                 layer ──(rigel map:build)──▶ knowledge/map/services.json
                                      │
        every service ◀──(rigel update)──────┘
```

### Publish your facts

```bash
create-rigel facts        # writes .rigel/service.json
```

Everything in it is **derived**, never asked of a human: what you publish (from your
`openapi:export` output), what you consume (from the contract `/api-sync` vendored, named by its
own `info.title`), and your infra (from `docker-compose.yml` and `.env.example`). Anything a person
has to remember to update is already wrong — that's why hand-written catalogs plateau around 88–90%
complete.

Commit it, then copy it into the layer as `facts/<service>.json`.

### Build the index

```bash
create-rigel map:build    # in the layer repo
```

It resolves who-consumes-whom by matching consumed API names against published ones, computes the
**reverse** edge (who consumes *you*), and folds in capability ownership from
`knowledge/business/capabilities/*.md`. The output carries a `GENERATED — do not edit` header; gate
it with regenerate-and-diff so a stale committed map fails CI.

### Ask the question

```bash
create-rigel map acme-billing
```

```
  acme-billing  (express)
  provides     billing-api
  CONSUMED BY  acme-web   ← these break if you change your contract
  infra        postgres, redis
  capability   checkout  (KPI conversion_rate, team-growth)
```

This runs in a repo that has never cloned `acme-billing`. **It prints a slice, never the whole
file** — at 50 services a full listing would consume the context window every session for nothing.
The map is data queried by a script, not a document loaded into context.

### What it does not know

- **Coupling that isn't in a contract.** A queue message, a shared database table, a hardcoded URL.
  The map is only as complete as the artifacts it derives from.
- **Whether a consumer actually uses the field you're changing.** It tells you *who* to talk to,
  not what will break.
- **Anything a service hasn't published facts for.** A repo that never ran `create-rigel facts` is
  invisible.

It is deliberately not cross-checked against live OpenTelemetry traces: the service-graph connector
is alpha, drops spans routinely, and a gate that cries wolf would cost you trust in the gates that
do work.
