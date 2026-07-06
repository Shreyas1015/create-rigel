# Product Roadmap

**Product:** *(name)* · **Brief:** *(one-line, or link to the brief)* · **Last updated:** *(YYYY-MM-DD)*
**Walking skeleton:** *(SPEC-001 — the thinnest end-to-end slice; build this first)*

> LIVING document — the altitude ABOVE specs. `/write-roadmap` writes it from a product brief.
> `/write-spec` reads it to pick the next spec and pre-fill epic + dependency context, and flips
> a row's **Spec ID** and **Status** as specs are created. Update in place; never delete history.

---

## Bounded Contexts (Epics)

| Epic | Bounded Context | Responsibility |
|---|---|---|
| *(none yet)* | — | — |

---

## Spec Roadmap (dependency-ordered)

| Order | Spec ID | Name | Epic | Depends On | Skeleton | Status |
|---|---|---|---|---|---|---|
| *(none yet)* | — | — | — | — | — | — |

> `Spec ID` is `—` until `/write-spec` creates the file and assigns the real number.
> `Depends On` references other rows by Spec ID (or by Order if not yet numbered).
> Exactly one row carries `✅ yes` in `Skeleton`. Every spec appears after its dependencies.

---

## Build Sequence Rationale

1. *(walking skeleton — why this thin slice first: proves auth + one entity + one endpoint end-to-end)*
2. *(next slice — what it unblocks)*

---

## Roadmap Statuses

| Status | Meaning |
|---|---|
| NOT_STARTED | On the roadmap, no spec file yet |
| DRAFT | `/write-spec` wrote a SPEC-XXX (in `draft/`) |
| READY | Spec approved — plannable |
| PLANNED | `/write-plan` created a plan |
| IN_PROGRESS | Being built |
| SHIPPED | Complete and live |
| CANCELLED | Removed from the roadmap |
