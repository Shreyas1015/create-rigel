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

Keeps a feature branch up to date by **rebasing** (never merging) onto its base, so
history stays linear and the eventual squash into `staging` is clean. The rebase-not-merge
rule lives here, not in an onboarding doc.

---

## Step 1 — Read the branch model from policy

```bash
policy=.rigel/git-policy.json
trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
integ=$(sed -n 's/.*"integration"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
branch=$(git rev-parse --abbrev-ref HEAD)
```

## Step 2 — Pick the base

- `hotfix/*` → base is **`$trunk`** (main) — hotfixes cut from and return to main.
- every other feature branch → base is **`$integ`** (staging).
- If you're *on* `$trunk` or `$integ`, there is nothing to sync — stop.

```bash
case "$branch" in
  hotfix/*) base="$trunk" ;;
  *)        base="$integ" ;;
esac
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
npm run gate   # or: /validate-layer
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
