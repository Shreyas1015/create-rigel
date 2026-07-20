#!/usr/bin/env bash
# check-protection-drift.sh — read the LIVE GitHub branch-protection settings back
# and fail if they no longer match .rigel/git-policy.json. Runs in CI (git-policy.yml).
#
# Template-aware / degrades gracefully: if gh isn't authenticated, the repo doesn't
# exist yet, or the token can't read protection (needs admin), it SKIPS with a notice
# instead of failing — so a bare template and forks stay green. Once the repo exists
# and a token with admin:repo can read protection, real drift fails the job.
set -euo pipefail

policy=".rigel/git-policy.json"
[ -f "$policy" ] || { echo "No $policy — skipping drift check."; exit 0; }
command -v gh >/dev/null 2>&1 || { echo "::notice::gh not available — skipping protection drift check."; exit 0; }
gh auth status >/dev/null 2>&1 || { echo "::notice::gh not authenticated — skipping protection drift check."; exit 0; }

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || { echo "::notice::no GitHub repo — skipping."; exit 0; }

scalar_list() { grep -E "\"$1\"[[:space:]]*:" "$policy" | grep -oE '"[^"]+"' | tail -n +2 | tr -d '"'; }
branch_bool() { grep -E "\"$1\"[[:space:]]*:[[:space:]]*\{" "$policy" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*(true|false)" | grep -oE 'true|false'; }

# Compare live protection against the policy's per-branch values (bools default false when a
# key is omitted). This tracks the solo-friendly defaults AND any team-hardened overrides.
drift=0
for branch in $(scalar_list protected); do
  want_linear=$(branch_bool "$branch" linear_history); want_linear=${want_linear:-false}
  want_codeowner=$(branch_bool "$branch" require_codeowner_review); want_codeowner=${want_codeowner:-false}
  want_admins=$(branch_bool "$branch" enforce_admins); want_admins=${want_admins:-false}
  prot=$(gh api "repos/$repo/branches/$branch/protection" 2>/dev/null) || {
    echo "::notice::cannot read protection for '$branch' (repo may be unprotected or token lacks admin) — skipping."
    exit 0
  }
  got_linear=$(printf '%s' "$prot" | grep -oE '"required_linear_history"[^}]*"enabled"[[:space:]]*:[[:space:]]*(true|false)' | grep -oE 'true|false' | tail -n1)
  got_codeowner=$(printf '%s' "$prot" | grep -oE '"require_code_owner_reviews"[[:space:]]*:[[:space:]]*(true|false)' | grep -oE 'true|false' | tail -n1)
  got_admins=$(printf '%s' "$prot" | grep -oE '"enforce_admins"[^}]*"enabled"[[:space:]]*:[[:space:]]*(true|false)' | grep -oE 'true|false' | tail -n1)

  [ "${got_linear:-false}" = "$want_linear" ] || { echo "::error::branch '$branch': required_linear_history is '${got_linear:-unset}', policy wants '$want_linear'"; drift=1; }
  [ "${got_codeowner:-false}" = "$want_codeowner" ] || { echo "::error::branch '$branch': require_code_owner_reviews is '${got_codeowner:-unset}', policy wants '$want_codeowner'"; drift=1; }
  [ "${got_admins:-false}" = "$want_admins" ] || { echo "::error::branch '$branch': enforce_admins is '${got_admins:-unset}', policy wants '$want_admins'"; drift=1; }
  [ "$drift" -eq 0 ] && echo "✓ '$branch' protection matches policy."
done

exit "$drift"
