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
drop=$(sed -n 's/.*"deploy_trigger"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$policy")
branch=$(git rev-parse --abbrev-ref HEAD)
```

## Step 2 — Choose base + merge method (from merge_strategy)

`main` is the source of truth. A feature is cut from `main`, tested on the stage server via
`drop`, and lands on `main` by one of two explicit paths — **never** by merging `staging`
into a feature or a feature carrying staging's other work into `main`.

| Intent | Head | Base | Merge method | Why |
|---|---|---|---|---|
| **Deploy to stage for testing** | `feat\|fix\|chore/PLAN-*` | `$drop` | **squash** | Merging into the disposable deploy-trigger branch deploys the feature to the stage server. `drop` never merges upward. |
| **Urgent go-live** (one feature) | `feat\|fix\|chore/PLAN-*` | `$trunk` (main) | **merge** | Ship this one verified feature immediately, isolated from staging's other in-flight work. **Guards:** the full CI gate must pass on this PR, and a post-deploy canary/smoke is required (`promotion.urgent` in the policy). |
| **Batch release** | `$integ` (staging) | `$trunk` (main) | **merge** (real) | Promote the whole verified stage release; keep per-feature history on main. |
| **Hotfix** | `hotfix/PLAN-*` | `$trunk` (main) | **merge**, then also open a PR into `$integ` | Fix prod, keep staging in sync. |

Never squash a `staging → main` or `feat → main` promotion — squashing collapses history and,
for the batch path, a whole release to one commit.

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

For an **urgent `feat → main`** PR, also state in the body: what it was tested against on the
stage server, and the canary/smoke plan for after it deploys (the `promotion.urgent` guards).

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

> Deploying to the stage server (`feat → drop`) is usually a direct merge/push, since `drop`
> is unprotected — it does not need a review PR. `/open-pr` is for the PRs that land on `main`.

## Step 6 — Report

```
PR opened: #<n>  {branch} → {base}  (merge method: {squash|merge})
PLAN:      PLAN-XXX
```
