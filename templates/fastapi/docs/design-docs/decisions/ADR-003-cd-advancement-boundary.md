# ADR-003 — CD advancement boundary: Rigel gates promotion, it does not wire deploy

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** PLAN-006 (Close-Out) — documents a boundary shipped with the PLAN-002 git workflow

---

## Context
The git workflow (`.rigel/git-policy.json`, `docs/git-workflow.md`) defines the branch model
`main` ← `staging` ← `drop` ← feature, with promotion **gates** (branch protection, CODEOWNERS
review, the branch-name / commit / PLAN-reference CI checks, and the protection drift check).

Two things the *gates* do not do:
1. **Advance `staging`** to the validated commit after the stage tests pass.
2. **Deploy** anything to a real environment (stage server, production).

How those happen depends entirely on the deploy target — Kubernetes, Vercel, ECS/Fargate,
Fly, Render, bare metal — and on the team's release cadence. There is no portable way to
prescribe it without being wrong for most projects.

## Decision
**Rigel enforces branch policy and promotion gates; it does NOT wire CD advancement or deploys.**
This is a deliberate boundary, not an omission.

**Rigel guarantees:**
- Protected `main` + `staging` (no direct push, no force-push, CODEOWNERS review, linear history
  where the policy sets it).
- The branch-name, Conventional-Commit-over-range, and PLAN-reference checks on every PR.
- A protection **drift check** in CI that fails if live GitHub settings diverge from the policy.

**The consuming project MUST wire (per its deploy target):**
- A pipeline triggered by pushes to `drop` that deploys to the **stage server**.
- **Advancement of `staging`** to the validated commit once the stage tests pass — this needs a
  bot/CI token permitted to update the protected `staging` branch.
- A **production deploy** on `main` merges (and any promotion/canary/rollback around it).

## Consequences
- `merge_strategy.drop_to_staging` in `git-policy.json` is a **declarative** statement of intent;
  the pipeline that honors it is project-owned.
- A freshly scaffolded project has fully enforced git hygiene but **no deploys** until CD is wired
  — expected, not broken.
- Because the boundary is now an explicit ADR, the missing CD wiring reads as a decision a
  reviewer can accept, not an oversight to "fix" by hard-coding one platform's deploy.
