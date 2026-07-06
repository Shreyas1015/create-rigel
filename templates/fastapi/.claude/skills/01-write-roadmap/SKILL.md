# /write-roadmap — Decompose a Product into an Ordered Spec Roadmap

**Verified:** 2026-06-19 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/write-roadmap` (optional arg: path to a brief file; else ask the human)

This is the altitude ABOVE specs. A real product is many specs, ordered by dependency — this
skill plans that SET. It writes ONLY `docs/product-specs/ROADMAP.md`; it NEVER writes spec files
(that is `/write-spec`'s job, which owns spec numbering).

## Step 1 — Get the Product Brief
If invoked with a file path argument, read that file. Otherwise ask the human:
"Paste the product brief — what we're building, for whom, and the core capabilities."
Do NOT proceed without a brief.

## Step 2 — Check for an Existing Roadmap (refresh, don't clobber)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null && echo "EXISTS — refresh: keep created specs"
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort
```
If a roadmap exists you are REFRESHING: preserve every row that already has a real Spec ID and
its Status; only add/reorder `NOT_STARTED` rows. Never renumber a created spec.

## Step 3 — Identify Bounded Contexts (Epics)
From the brief, list the distinct bounded contexts — each owns a cohesive set of entities and
rules (e.g. Identity, Billing, Catalog). Only the contexts the brief implies; no speculative ones.

## Step 4 — Propose an Ordered Spec List with Dependencies
Break each epic into shippable specs (one feature each — the `/write-spec` altitude). For each
spec record: name, epic, and which specs it depends on (an entity / auth / contract another spec
must establish first). Order the whole list topologically — every spec appears after its
dependencies. Keep each spec small enough to become ONE execution plan (split if not).

## Step 5 — Pick the Walking-Skeleton First Slice
Choose the single thinnest spec that exercises the system end-to-end — typically auth + one
entity + one persisted endpoint with a test — and that depends on nothing. Mark exactly one spec
as the skeleton. This is what the human builds first to prove every layer's path works.

## Step 6 — Write / Refresh the Roadmap
Save to `docs/product-specs/ROADMAP.md` using the template already in that file's header
(self-documenting). Fill: Bounded Contexts, the dependency-ordered Spec Roadmap table, and the
Build Sequence Rationale.
- New specs get Spec ID `—` and Status `NOT_STARTED`.
- On refresh, keep existing Spec IDs and Statuses untouched; never renumber a created spec.
- Set the **Walking skeleton** header to the chosen first slice.

## Step 7 — Tell the Human
```
Roadmap written: docs/product-specs/ROADMAP.md
{N} specs across {M} epics, dependency-ordered.
Walking skeleton (build first): {skeleton spec name}

Review the roadmap. When the order looks right:
  1. Run /write-spec — it reads ROADMAP.md and authors the next NOT_STARTED spec
     (starting with the walking skeleton), pre-filling its epic + dependencies.
  2. Repeat /write-spec down the list as you go.

/write-roadmap does NOT write spec files. It only plans the set. Each spec is authored
individually by /write-spec, now guided by this roadmap.
```
