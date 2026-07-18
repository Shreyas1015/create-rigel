---
name: open-pr
description: /open-pr — Open a PR with the correct base and a PLAN-filled body
verified: 2026-07-15
libraries: []
source: git
note: Process skill — gh + git only. Reads .rigel/git-policy.json for base + merge strategy.
---

# /open-pr — Open the Right Pull Request

Triggered by: `/open-pr`

Opens a PR whose **base branch and merge method are chosen from `.rigel/git-policy.json`**,
never hardcoded, and whose body is filled from the active PLAN so the "never code without a
plan" rule is visible on every PR.

---

## Step 1 — Read policy + current branch

```bash
policy=.rigel/git-policy.json
trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
integ=$(sed -n 's/.*"integration"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
branch=$(git rev-parse --abbrev-ref HEAD)
```

## Step 2 — Choose base + merge method (from merge_strategy)

| Branch | Base | Merge method | Why |
|---|---|---|---|
| `feat\|fix\|chore/PLAN-*` | `$integ` (staging) | **squash** | one clean commit per feature |
| `$integ` → promote a release | `$trunk` (main) | **merge** (real) | keep per-feature history on main |
| `hotfix/PLAN-*` | `$trunk` (main) | **merge**, then also open a second PR into `$integ` | fix prod, keep staging in sync |

Never squash a `staging → main` promotion — that collapses a whole release to one commit.

## Step 3 — Require a PLAN reference

The branch name or PR body MUST contain `PLAN-XXX` (CI enforces this too):

```bash
plan_id=$(printf '%s' "$branch" | grep -oE 'PLAN-[0-9]{3}' | head -n1)
[ -n "$plan_id" ] || { echo "No PLAN id in branch name — find the active plan under docs/exec-plans/active/"; }
```

Find the active plan file: `ls docs/exec-plans/active/*.md`.

## Step 4 — Build the body from the active PLAN

Assemble the PR body from the plan's **Acceptance Criteria**, the **Progress log** (which
layers are done), and the **Decision log**. Shape:

```markdown
## PLAN-XXX — <title>

### What this PR delivers
- <the acceptance criteria this branch satisfies>

### Progress
- <checked/unchecked layers from the plan>

### Decisions
- <relevant decision-log entries>

Closes: <issue if any>
```

## Step 5 — Create the PR

```bash
gh pr create --base "$base" --head "$branch" \
  --title "$(git log -1 --pretty=%s)" \
  --body-file <(...assembled body...)
```

For a hotfix, after the `main` PR, open the sync PR too:
```bash
gh pr create --base "$integ" --head "$branch" --title "hotfix sync: <slug>" --body "Mirror of the main hotfix into $integ."
```

## Step 6 — Report

```
PR opened: #<n>  {branch} → {base}  (merge method: {squash|merge})
PLAN:      PLAN-XXX
```
