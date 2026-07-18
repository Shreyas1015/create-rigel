# Git Workflow

This project's git rules are **enforced, not remembered**. The single source of truth is
[`.rigel/git-policy.json`](../.rigel/git-policy.json); the hooks, skills, CI, and the
protection script all read from it — no rule is written down twice.

## Branch model

`main` is the **source of truth**. Features are cut from `main` and kept clean; a feature
reaches `main` carrying **only its own changes**, never staging's other in-flight work.

```
                        ┌── urgent: one verified feature ships now ──┐
                        │                                            ▼
main    ──●─────────────┼──────────────────────────────────────────●──  production; tagged releases
  │                     │                                       ▲
  │  feat/PLAN-014 ─────┤ (cut from main, rebased on main)      │ batch: whole verified release
  │      │              └─► drop ─► [stage server] ─► test      │
  │      └──────────────────────────────────────────────────  staging ──┘  (mirrors last-good stage)
```

- **Feature branches** are cut from `main`, named `feat|fix|chore/PLAN-XXX-slug`, and
  **rebased on `main`** (never on `staging` or `drop`). That isolation is the whole point.
- **`drop`** is a disposable **deploy-trigger** branch. Merging a feature into `drop` (squash)
  deploys it to the **stage server** for testing. `drop` never merges upward; it can be reset
  from `main` freely to clear the deck.
- **`staging`** mirrors the last **validated** stage state. After the stage tests pass, the
  deploy pipeline advances `staging` to the verified commit.
- **Two paths land on `main`:**
  - **Urgent** — `feat → main` (real merge): ship one verified feature immediately, isolated
    from staging's other work. **Guards:** the full CI gate must pass on the PR **and** a
    post-deploy canary/smoke is required.
  - **Batch** — `staging → main` (real merge): promote the whole verified stage release.
- **`hotfix/PLAN-XXX-slug`:** cut from `main`, merges back to **both** `main` and `staging`.

`main` and `staging` are protected: PR + CODEOWNERS review, no direct pushes, no force-push.
`drop` is intentionally **unprotected** — it is a throwaway deploy target.

> **On the urgent path — "test ≠ ship."** A feature is tested on the stage server *alongside*
> whatever else is on `drop`, but an urgent `feat → main` ships it *alone*. The two guards
> exist to close that gap: CI re-validates `main + feature` on the PR, and the canary/smoke
> catches anything the shared-stage test masked. Don't skip them.

## What enforces what

| Rule | Enforced by |
|---|---|
| Conventional commit messages | `.githooks/commit-msg` (local) + `git-policy` CI |
| Branch name pattern | `.githooks/pre-push` (local) + `git-policy` CI |
| PR references an active PLAN | `git-policy` CI |
| Branch protection / review / linear history | GitHub, via `scripts/protect-branch.sh` |
| Protection stays as configured | `scripts/check-protection-drift.sh` in CI |

Local hooks are toolchain-free POSIX shell activated by `git config core.hooksPath .githooks`
(done for you at `/infra-setup` — no husky, no node needed for the git rules themselves).

## One-time setup — after you create the GitHub repo

The GitHub repo doesn't exist when the project is scaffolded, so branch protection can't be
applied then. Run this **once**, after `git push`-ing to a new GitHub repo:

```bash
gh auth login                              # if not already authenticated
bash scripts/protect-branch.sh --dry-run   # preview the API calls
bash scripts/protect-branch.sh             # apply protection to main + staging
```

Then create the workflow branches if they don't exist yet:

```bash
git switch -c staging main && git push -u origin staging
git switch -c drop main    && git push -u origin drop
git switch main
```

Wire your CD so that a push to `drop` deploys to the stage server, and — once the stage
tests pass — advances `staging` to the validated commit (this needs a token that can update
the protected `staging` branch). After that, CI's drift check fails if anyone loosens the
protection out from under the policy.

## Everyday flow (agent-driven)

```
/build-layer          # build + gate a layer on your feature branch (cut from main)
/sync-branch          # rebase onto main, re-run the gate
# deploy to stage for testing:
git switch drop && git merge --squash feat/PLAN-XXX-slug && git commit && git push   # → stage server
/open-pr              # land on main: urgent (feat→main) or batch (staging→main), body from the active PLAN
```

`/open-pr` picks the base and merge method from the policy — urgent `feat → main`, batch
`staging → main`, or `hotfix`. Deploying to stage (`feat → drop`) is a direct push, since
`drop` is unprotected.
