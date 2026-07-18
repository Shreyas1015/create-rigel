# Git Workflow

This project's git rules are **enforced, not remembered**. The single source of truth is
[`.rigel/git-policy.json`](../.rigel/git-policy.json); the hooks, skills, CI, and the
protection script all read from it — no rule is written down twice.

## Branch model

```
main    ──●──────────●──────────  production; tagged releases only
             ↑            ↑
staging ──●──●────●───●───●──────  integration + pre-prod; where features land
          ↑ ↑     ↑
feature  feat/PLAN-014-user-auth  cut from staging, one PLAN each, short-lived
```

- **Feature branches** are cut from `staging`, named `feat|fix|chore/PLAN-XXX-slug`.
- **Feature → `staging`:** squash merge (one clean commit; branch auto-deleted).
- **`staging` → `main`:** real merge, *not* squash — `main`'s history keeps a commit per
  feature that shipped in the release.
- **`hotfix/PLAN-XXX-slug`:** the one exception — may cut from `main`, merges back to
  **both** `main` and `staging`.

`main` and `staging` are both protected: PR + CODEOWNERS review required, no direct pushes,
no force-push. `staging` requires linear history (squash-only inbound); `main` does not
(so a promotion can be a real merge commit).

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
gh auth login                       # if not already authenticated
bash scripts/protect-branch.sh --dry-run   # preview the API calls
bash scripts/protect-branch.sh             # apply protection to main + staging
```

Then create `staging` if it doesn't exist yet:

```bash
git switch -c staging main && git push -u origin staging
```

After that, CI's drift check will fail if anyone loosens the protection out from under the
policy.

## Everyday flow (agent-driven)

```
/build-layer          # build + gate a layer on your feature branch
/sync-branch          # rebase onto staging, re-run the gate
/open-pr              # PR into staging (squash), body auto-filled from the active PLAN
```

Promotion (`staging → main`) and hotfixes use `/open-pr`, which picks the base and merge
method from the policy.
