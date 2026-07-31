# Running Rigel at company level

Rigel scaffolds a project once. That is useful for one person. For a company you need three more
things, and this is how they work.

| | What it is |
|---|---|
| **A company layer** | one git repo holding your organisation's overlay on a Rigel template |
| **A manifest** | `.rigel/manifest.json` in every service — the return address |
| **`update` + `verify`** | how the layer reaches those services, and how CI proves it stuck |

Without the manifest, a scaffolded repo is unreachable forever: no updates, no verification. It is
written at scaffold time and **cannot be added retroactively**.

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
