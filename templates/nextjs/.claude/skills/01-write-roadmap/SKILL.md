# /write-roadmap — Decompose a Product Frontend into an Ordered Spec Roadmap

Triggered by: `/write-roadmap` (optional arg: path to the product brief; else ask the human)

This is the altitude ABOVE specs. A real product frontend is many screens/flows across several
feature areas and personas — this skill plans that SET, ordered by dependency, and picks a
walking-skeleton first slice. It writes ONLY `docs/product-specs/ROADMAP.md`; it NEVER writes
spec files (that is `/write-spec`'s job, which owns spec numbering).

**Two inputs:** the same product **brief** the backend used, and the backend **`openapi.json`**
(the real contract). The brief says *what/for whom/which personas*; the OpenAPI says *what is
actually buildable*. The frontend roadmap is NOT a mirror of the backend roadmap — it
re-decomposes the product along **frontend axes** (screens, flows, personas, real-time).

## Step 1 — Gather Brief + Contract
Read the product brief (arg path, or ask the human to paste it). Confirm the backend contract is
present:
```bash
ls openapi.json src/types/api.generated.ts 2>/dev/null
```
If `openapi.json` exists but `api.generated.ts` doesn't (or may be stale), tell the human to run
`/api-sync` first so the roadmap can reference real endpoints. Do not proceed without a brief.

## Step 2 — Check for an Existing Roadmap (refresh, don't clobber)
```bash
ls docs/product-specs/ROADMAP.md 2>/dev/null && echo "EXISTS — refresh: keep created specs"
ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep "SPEC-" | sort
```
If a roadmap exists you are REFRESHING: preserve every row that already has a real Spec ID and
its Status; only add/reorder `NOT_STARTED` rows. Never renumber a created spec.

## Step 3 — Identify Feature Areas & Personas
From the brief + the OpenAPI tags, group the UI into a SMALL set of **feature areas** (screen
clusters), and note the **personas** (e.g. agent, supervisor, admin) — different personas are
often different surfaces over the same API. Two truths that make this NOT a 1:1 map of endpoints:
- One screen composes MANY endpoints (a dashboard pulls several domains + a live feed).
- Many endpoints have NO UI (machine-to-machine: ingestion, orchestration, internal jobs).
So the OpenAPI is the *contract*, not the roadmap — you decide the screens.

## Step 4 — Order Specs by Dependency + Map to Backend
Break each feature area into shippable frontend specs (one coherent screen/flow each). For every
spec record: name, feature area, the **backend SPEC/domain it `Implements`** (consumes), and which
*frontend* specs it depends on. Honor the unforgiving frontend order:
- **App shell + auth + role routing + design-system primitives come first** — everything depends on them.
- A **shared real-time client** (WebSocket/Socket.IO) is a dependency of every live screen — build it once, early.
- A frontend spec is only *buildable* when its `Implements` backend spec is **SHIPPED** — order accordingly.
Order the whole list topologically. Keep each spec small enough to become ONE execution plan.

## Step 5 — Pick the Walking-Skeleton First Slice
Choose the single thinnest spec that exercises the whole stack end-to-end — typically **login +
app shell + one auth-gated route that fetches via the generated client through a TanStack Query
hook and renders** (for a real-time product, also open the WS and render one live event). It must
depend on nothing. Mark exactly one spec as the skeleton. Build it first to prove routing + auth +
openapi-fetch + TanStack Query (+ the WS client) all wire up before any feature screen.

## Step 6 — Write / Refresh the Roadmap
Save to `docs/product-specs/ROADMAP.md` using the template in that file's header (self-documenting).
Fill: Feature Areas & Personas, the dependency-ordered Spec Roadmap table (with the `Implements`
column), and the Build Sequence Rationale.
- New specs get Spec ID `—` and Status `NOT_STARTED`.
- On refresh, keep existing Spec IDs/Statuses untouched; never renumber a created spec.
- Set the **Walking skeleton** header to the chosen first slice.

## Step 7 — Tell the Human
```
Roadmap written: docs/product-specs/ROADMAP.md
{N} frontend specs across {M} feature areas / {P} personas, dependency-ordered.
Walking skeleton (build first): {skeleton spec name}

Review the roadmap. When the order looks right:
  1. Run /api-sync (ensure api.generated.ts matches the backend).
  2. Run /write-spec — it reads ROADMAP.md and authors the next NOT_STARTED spec whose
     `Implements` backend spec is SHIPPED (starting with the walking skeleton).
  3. /write-plan → /build-layer down the list as backend capabilities ship.

/write-roadmap does NOT write spec files. It only plans the set.
```
