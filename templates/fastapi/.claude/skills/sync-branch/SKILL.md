---
name: sync-branch
description: /sync-branch — Rebase the current branch onto its policy base and re-run the gate
verified: 2026-07-15
libraries: []
source: git
note: Process skill — git operations only. Reads .rigel/git-policy.json for the branch model.
---

# /sync-branch — Keep the Current Branch Current

Triggered by: `/sync-branch`

Keeps a feature branch up to date by **rebasing** (never merging) onto **`main`**, so the
branch stays clean and can promote to `main` carrying only its own changes. **Feature branches
rebase on `main`, never on `staging` or `drop`** — that is what keeps the eventual `feat → main`
promotion isolated from staging's other in-flight work. The rebase-not-merge rule lives here,
not in an onboarding doc.

---

## Step 1 — Read the branch model from policy

```bash
policy=.rigel/git-policy.json
trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
integ=$(sed -n 's/.*"integration"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
drop=$(sed -n 's/.*"deploy_trigger"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
branch=$(git rev-parse --abbrev-ref HEAD)
```

## Step 2 — Pick the base

Every feature/fix/chore/hotfix branch is cut from **`$trunk`** (main) and rebases on it.
`main` is the source of truth; `staging` and `drop` are downstream deploy/test targets and are
**never** a rebase base.

- If you're *on* `$trunk`, `$integ`, or `$drop`, there is nothing to sync — stop.
- Otherwise → base is **`$trunk`** (main).

```bash
case "$branch" in
  "$trunk"|"$integ"|"$drop") echo "On a workflow branch — nothing to sync."; exit 0 ;;
esac
base="$trunk"
```

## Step 3 — Fetch and rebase

```bash
git fetch origin "$base"
git rebase "origin/$base"
```

## Step 4 — On conflict: resolve, don't merge

- Resolve each conflicted file, keeping BOTH the incoming base changes and this branch's intent.
- `git add <file>` → `git rebase --continue`.
- Never `git rebase --abort` into a `git merge` — the policy is rebase-only for feature branches.

## Step 5 — Re-run the gate

After a rebase the tree changed — the gate must pass again:

```bash
make gate   # or: /validate-layer
```

If it fails → fix, `git add -A`, amend the relevant commit or add a fixup, re-run the gate.

## Step 6 — Update the remote branch

A rebase rewrites history, so the push must be force-with-lease (safe — it refuses if
someone else pushed in the meantime):

```bash
git push --force-with-lease origin "$branch"
```

## Step 7 — Report

```
Synced {branch} onto origin/{base}
Rebased: {N} commits replayed
Gate:    PASS
```
