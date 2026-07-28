# PLAN-008 — The day-2 loop

**Status:** ACTIVE
**Target release:** v0.10.0
**Owner:** @Shreyas1015
**Research:** 4 completed streams (org/adoption, service catalog, KB distribution, contract drift)
**Next:** PLAN-009 (knowledge layer) depends on this shipping first

---

## What this plan does, in plain words

Today Rigel is a **photocopier**. It hands you a starter project and forgets you exist. If Rigel
improves next month, or your company changes a rule, there is no way to get that into the repos
already created.

This plan builds **the pipe**: a way for Rigel — and for a company's own layer — to reach a repo
after day 0, and for CI to prove what landed is still intact.

It builds nothing else. What flows *through* the pipe (the company knowledge layer) is PLAN-009.
The pipe has to exist first, or nothing can be delivered or kept current.

**Why this is urgent:** `.rigel/manifest.json` is **retroactively impossible**. Every repo scaffolded
without it is permanently unreachable — no updates, ever. This is the CRA/Yeoman failure shape, and
every day it isn't shipped, more repos are born unreachable.

---

## Acceptance Criteria

### AC-1 — Provenance manifest, written at scaffold time
Every scaffolded repo gets `.rigel/manifest.json`, in all four templates.

```jsonc
{
  "schemaVersion": 1,
  "template": "express",
  "createdWith": "0.10.0",
  "updatedWith": "0.10.0",
  "source": { "kind": "npm", "spec": "create-rigel@0.10.0", "integrity": "sha512-…" },
  "layer":  { "uri": "gh:acme/acme-rigel", "sha": "a1b2c3d" },   // null when no company layer
  "answers": { "projectName": "acme-api" },
  "ownership": {
    "managed": [".claude/**", "scripts/**", ".githooks/**", ".github/workflows/**", "Makefile"],
    "seed":    ["AGENTS.md", "ARCHITECTURE.md", "STATE.md", "README.md", ".gitignore"],
    "user":    ["src/**", "tests/**", "docs/product-specs/**", "docs/exec-plans/**"]
  },
  "files": { ".claude/rules/testing.md": "9c02…", "scripts/curate-scan.mjs": "41ae…" },
  "deletedByUser": [],
  "waivers": []
}
```

- `files` holds the sha256 of **exactly what Rigel last wrote** — the oracle that answers *"did the
  user touch this?"* with no 3-way merge. ~90% of files then need no conflict handling at all.
- `ownership` ships as **data**, not hardcoded, so a repo keeps its contract until an update
  explicitly changes it.
- `layer` is reserved now even though PLAN-009 fills it — adding a field later is cheap, migrating
  repos scaffolded without the concept is not.

### AC-2 — `rigel verify` (the CI gate)
Regenerate every `managed` path at the version pinned in the manifest; `git diff --exit-code`.
Deterministic, offline, and failing only on something the PR author controls — the Kubernetes
`verify-codegen.sh` primitive.

- **Escape hatch:** a `waivers` entry with `path`, `sha256`, `reason`, `owner`, `expires`. An
  **expired waiver fails the build**, so a temporary exception cannot silently become permanent.
- Also fails on: missing/unparseable manifest, committed `*.rigel-new`, conflict markers.
- **Must NOT fail** because a newer `create-rigel` exists — that is `cruft check`'s antipattern,
  red-lighting a PR on the maintainer's release schedule. Never fails on calendar age either.
- Wired into each template's gate and CI.

### AC-3 — `rigel update`
```
rigel update [--to <version|latest>] [--dry-run]
             [--conflict=sidecar|inline|theirs] [--allow-dirty]
```
Refuses a dirty tree by default — the update must land as one reviewable `git diff`. Materialise
BASE (manifest version) and THEIRS (target), render both with `answers`, then per managed path:

| condition | action |
|---|---|
| untouched (`sha == manifest.files[p]`) | overwrite with THEIRS — **no merge needed** |
| upstream unchanged, mine differs | leave mine, report `drifted:` |
| all three differ | `git merge-file`; if clean, write |
| merge conflicts | write THEIRS to `<path>.rigel-new`, leave mine untouched, report `CONFLICT:` |
| deleted by user | do **not** resurrect; record in `deletedByUser` |

`seed` written only if absent. `user` never read or written. Rewrites the manifest, prints a summary,
exits 0. **No auto-commit** — `git diff` is the review UI.

**Sidecar conflicts**, not `.rej` (cruft's most-complained-about behaviour; a whole tool exists to
clean them up) and not inline markers (copier #1833: opening them in VS Code or `git mergetool`
*silently discards the upstream side*). A sidecar is greppable, diffable, and can itself be a gate.

### AC-4 — `--template <giget-uri>`
`npx create-rigel my-svc --template gh:acme/acme-rigel#<sha>`. giget provides provider prefixes
(`gh:`/`gitlab:`/`bitbucket:`), subpaths, `#ref` SHA pinning, an offline cache, and `GIGET_AUTH` for
private repos (note: it does **not** read `GITHUB_TOKEN` — map it explicitly). The resolved source +
SHA is recorded in the manifest so update works identically for a company layer and a built-in one.

**No registry.** A *verified-publisher* VS Code extension with 2.2M installs shipped malware for 18
minutes to 6,000+ users; the controls that stopped 2025–26 supply-chain attacks were platform-level
and unavailable to a solo maintainer.

### AC-5 — Company layer format + guide
Define `rigel-layer.json` and the `managed/` / `seed/` / `lessons/` structure a company layer uses
to overlay a base template. Guide in `docs/company-level.md`: creating a layer, pinning by SHA,
rolling an update across services, the waiver process.

Ship one **worked example layer** in the repo so the format is proven, not merely described.
(`knowledge/` is defined by PLAN-009; the format must leave room for it without shipping it.)

### AC-6 — Verify end-to-end (doctrine is 5-for-5)
Component checks are not the release gate. Close with a real run:
- Scaffold each template → manifest present, hashes match what's on disk.
- Scaffold from a **private** company layer via `--template gh:...#<sha>` using `GIGET_AUTH`.
- Hand-edit a managed file → `verify` **fails**; add a waiver → passes; expire the waiver → fails again.
- Publish a template change → `update` produces a reviewable diff; an untouched file updates
  silently; a locally-edited one produces a `.rigel-new` sidecar and does **not** clobber.
- Delete a managed file → `update` does not resurrect it.
- Confirm `verify` does **not** fail merely because a newer `create-rigel` exists.

---

## Progress log
- [ ] AC-1 manifest, all four templates
- [ ] AC-2 `rigel verify` + waivers + expiry, wired into the gate
- [ ] AC-3 `rigel update` + sidecar conflicts
- [ ] AC-4 `--template <giget-uri>` + manifest records the source
- [ ] AC-5 company layer format + guide + worked example
- [ ] AC-6 end-to-end verification

---

## Decision log
- **Split from the original PLAN-008.** The pipe and the knowledge layer are separate releases so
  each gets full effort. The pipe ships first because nothing can be delivered or kept current
  without it.
- **The manifest is the irreversible piece** and ships first inside this plan. `rigel verify` is
  useful with exactly one user (dogfooding); `rigel update` has no consumers yet but must exist
  before a company layer means anything.
- **Ownership is data in the manifest**, not code, so `verify` and `update` can never disagree about
  who owns what, and an old repo keeps its old contract.
- **Sidecar conflict files** over `.rej` and inline markers — both alternatives have documented
  failure modes that silently lose the upstream side.
- **Staleness never hard-fails CI.** The hard-fail primitive is regenerate-and-diff (`verify`); a
  newer upstream version produces a scheduled PR, not a red build.
- **No registry, ever.** `--template <git-uri>` covers the real need at zero moderation cost.
