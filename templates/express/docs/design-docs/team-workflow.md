# Team Workflow

How a 5-person team collaborates on this harness. Pairs with `.github/CODEOWNERS`
and `.github/pull_request_template.md`.

---

## Branching

- `main` is always deployable. No direct pushes.
- Feature branches: `<type>/<short-slug>` — e.g. `feat/application-stages`, `fix/cursor-decode`.
- One feature = one branch = one plan in `docs/exec-plans/active/`.
- Rebase on `main` before opening a PR; keep branches short-lived (< 3 days).

## The PR Flow

1. Build layer-by-layer with `/build-layer`; each layer is gated and committed.
2. When the plan's layers are all checked off, run `/garbage-collect`.
3. Open a PR — the template checklist auto-populates. Fill every box.
4. CI must be green (lint → typecheck → test → audit → secret-scan → arch-check).
5. Code Owners review (see below). Address feedback with new commits (don't force-push mid-review).
6. Squash-merge to `main`. Delete the branch.

## Branch Protection (configure on `main` in GitHub → Settings → Branches)

- [x] Require a pull request before merging
- [x] Require approvals: **1** (2 for security-sensitive paths)
- [x] Require review from Code Owners
- [x] Dismiss stale approvals when new commits are pushed
- [x] Require status checks to pass: `ci`
- [x] Require branches to be up to date before merging
- [x] Require conversation resolution before merging
- [x] Do not allow bypassing the above (applies to admins too)
- [x] Restrict who can push to matching branches (no direct pushes)

## Approve vs. Merge

| Action | Who |
|---|---|
| Open a PR | Anyone |
| Review / approve | Any engineer not the author |
| Approve security-sensitive paths (`auth/`, `hooks/`, `config/`, `migrations/`) | A Code Owner for that path (per `CODEOWNERS`) |
| Merge to `main` | The PR author, once required approvals + CI are green |
| Merge a security-sensitive PR | A `leads` member |

Rule of thumb: **the author merges their own PR** after it's approved and green — this
keeps ownership with the person who has the most context. Exception: security-sensitive
PRs are merged by a Code Owner.

## Required Reviews by Path

These come from `.github/CODEOWNERS`. Edit that file to swap the placeholder team
slugs for your real ones, then enable "Require review from Code Owners" in branch
protection so they're enforced:

- `/.claude/hooks/`, `/src/providers/auth/`, `/src/config/` → `@your-team/leads` (security-sensitive)
- `/Dockerfile`, `/docker-compose.yml`, `/.github/workflows/` → `@your-team/platform` (build/containers/CI)
- `/db/migrations/` → `@your-team/leads` (irreversible DB changes)
- everything else → `@your-team/engineers`

## Hotfixes

- Branch from `main`: `fix/<slug>`. Same PR flow, but reviewers prioritise.
- A hotfix still needs CI green and one approval — no exceptions, even under pressure.
