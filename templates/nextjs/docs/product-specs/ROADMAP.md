# Product Roadmap (Frontend)

**Product:** *(name)* · **Brief:** *(one-line, or link to the brief)* · **Last updated:** *(YYYY-MM-DD)*
**Walking skeleton:** *(SPEC-001 — login + app shell + one auth-gated route that fetches via the generated client; build first)*

> LIVING document — the altitude ABOVE specs. `/write-roadmap` writes it from the product brief
> + the backend `openapi.json`. `/write-spec` reads it to pick the next spec (one whose
> `Implements` backend spec is SHIPPED) and flips a row's **Spec ID** + **Status** as specs are
> created. Update in place; never delete history.
>
> This is NOT a mirror of the backend roadmap — it re-decomposes the product along **frontend
> axes** (screens, flows, personas, real-time). The OpenAPI is the *contract*, not the roadmap:
> one screen composes many endpoints, and many endpoints have no UI.

---

## Feature Areas & Personas

| Feature Area | Persona(s) | What the user does here |
|---|---|---|
| *(none yet)* | — | — |

> Personas (e.g. agent / supervisor / admin) are often different surfaces over the same API.

---

## Spec Roadmap (dependency-ordered)

| Order | Spec ID | Name | Feature Area | Implements (backend SPEC/domain) | Depends On | Skeleton | Status |
|---|---|---|---|---|---|---|---|
| *(none yet)* | — | — | — | — | — | — | — |

> `Spec ID` is `—` until `/write-spec` creates the file and assigns the real number.
> `Implements` = the backend spec/domain this UI consumes; a row is only **buildable** once that
> backend spec is SHIPPED. `Depends On` references other *frontend* rows. Exactly one row is the
> `✅ yes` skeleton, and it depends on nothing.

---

## Build Sequence Rationale

1. *(walking skeleton — why first: proves auth + app shell + generated client + TanStack Query, and the WS client for a real-time product)*
2. *(shared design-system / layout / real-time client — what it unblocks)*
3. *(first persona surface, gated on its backend specs being shipped)*

---

## Roadmap Statuses

| Status | Meaning |
|---|---|
| NOT_STARTED | On the roadmap, no spec file yet |
| BLOCKED | Backend spec it `Implements` is not SHIPPED yet |
| DRAFT | `/write-spec` wrote a SPEC-XXX (in `draft/`) |
| READY | Spec approved — plannable |
| PLANNED | `/write-plan` created a plan |
| IN_PROGRESS | Being built |
| SHIPPED | Complete and live |
| CANCELLED | Removed from the roadmap |
