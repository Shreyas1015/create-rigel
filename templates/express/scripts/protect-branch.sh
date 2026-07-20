#!/usr/bin/env bash
# protect-branch.sh — apply the branch protection encoded in .rigel/git-policy.json
# to this project's GitHub repo. Run ONCE, after the GitHub repo exists:
#
#   bash scripts/protect-branch.sh            # apply
#   bash scripts/protect-branch.sh --dry-run  # print what it would do, change nothing
#
# Requires: gh (authenticated). Reads the policy with sed/grep only — no jq needed.
#
# Applies to the `protected` branches (main + staging). `drop` is intentionally NOT
# protected — it is a disposable deploy-trigger branch.
# What GitHub can and cannot enforce per branch:
#   - required_linear_history is PER BRANCH, read from policy.protection.<branch>.
#     Both main and staging allow real merge commits here (the two promotion paths that
#     land on main — urgent feat→main and batch staging→main — are real merges).
#   - Allowed merge BUTTONS (squash/merge/rebase) are a REPO-WIDE setting, not per
#     branch. We enable squash (for feature→drop deploys) + merge (for the →main
#     promotions) and disable rebase; which one is used per PR is chosen by /open-pr
#     per the policy's merge_strategy.
set -euo pipefail

policy=".rigel/git-policy.json"
dry_run=false
[ "${1:-}" = "--dry-run" ] && dry_run=true

[ -f "$policy" ] || { echo "✗ $policy not found — run from the repo root."; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "✗ gh (GitHub CLI) is required and must be authenticated."; exit 1; }

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "Repo: $repo"

# --- tiny policy readers (single-line JSON values only) --------------------------
scalar_list() { # $1=key → newline-separated array string values
  grep -E "\"$1\"[[:space:]]*:" "$policy" | grep -oE '"[^"]+"' | tail -n +2 | tr -d '"'
}
branch_bool() { # $1=branch $2=key → true|false (from that branch's protection line)
  grep -E "\"$1\"[[:space:]]*:[[:space:]]*\{" "$policy" \
    | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*(true|false)" | grep -oE 'true|false'
}
branch_num() { # $1=branch $2=key → integer (from that branch's protection line)
  grep -E "\"$1\"[[:space:]]*:[[:space:]]*\{" "$policy" \
    | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*[0-9]+" | grep -oE '[0-9]+$'
}
auto_delete=$(grep -oE '"auto_delete_head"[[:space:]]*:[[:space:]]*(true|false)' "$policy" | grep -oE 'true|false')

run() { # echo + (unless dry-run) execute
  echo "  → $*"
  $dry_run || "$@"
}

# --- repo-level: merge buttons + auto-delete head branches -----------------------
echo "Repo settings: allow squash+merge, disable rebase, delete_branch_on_merge=$auto_delete"
run gh api --method PATCH "repos/$repo" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=true \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge="${auto_delete:-true}"

# --- per-branch protection -------------------------------------------------------
# All protection knobs come from policy.protection.<branch> (solo-friendly defaults — see the
# git-policy.json protection_note; harden there as the team grows). PR-only, no force-push, and
# no branch deletion are always on.
for branch in $(scalar_list protected); do
  linear=$(branch_bool "$branch" linear_history)
  approvals=$(branch_num "$branch" required_approving_reviews)
  codeowner=$(branch_bool "$branch" require_codeowner_review)
  admins=$(branch_bool "$branch" enforce_admins)
  echo "Protecting '$branch' (linear=${linear:-false}, approvals=${approvals:-0}, codeowner=${codeowner:-false}, enforce_admins=${admins:-false}, PR-only, no force-push/delete)"
  body=$(cat <<JSON
{
  "required_status_checks": null,
  "enforce_admins": ${admins:-false},
  "required_pull_request_reviews": {
    "required_approving_review_count": ${approvals:-0},
    "require_code_owner_reviews": ${codeowner:-false},
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": ${linear:-false},
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
)
  if $dry_run; then
    echo "  → gh api --method PUT repos/$repo/branches/$branch/protection --input - <<'JSON'"
    echo "$body" | sed 's/^/      /'
  else
    printf '%s' "$body" | gh api --method PUT "repos/$repo/branches/$branch/protection" --input -
  fi
done

echo "✓ Done${dry_run:+ (dry-run — nothing changed)}."
