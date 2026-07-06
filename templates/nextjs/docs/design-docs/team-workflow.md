# Team Workflow — Branch Protection & Review Policy

Referenced by `.github/CODEOWNERS`. This documents how the harness is operated by a
team: branch protection, who reviews what, and the merge rules. Adjust to your org.

---

## Branch model

- `main` is protected and always deployable. No direct pushes.
- All work lands via pull request from a short-lived branch:
  `feat/<scope>`, `fix/<scope>`, `chore/<scope>`.
- One execution plan → one (or a few) PRs; one layer per commit where practical.

## Branch protection rules (GitHub → Settings → Branches → `main`)

Enable:

- [ ] **Require a pull request before merging**
- [ ] **Require approvals** — at least **1** (2 for security-sensitive paths)
- [ ] **Require review from Code Owners** — activates `.github/CODEOWNERS`
- [ ] **Require status checks to pass** → select the **CI / verify** check
      (typecheck · lint · format · test · build) and **Lighthouse CI** for UI PRs
- [ ] **Require branches to be up to date before merging**
- [ ] **Require conversation resolution before merging**
- [ ] **Do not allow bypassing the above** (applies to admins too)

## Who reviews what (CODEOWNERS)

| Path | Owner | Why |
|---|---|---|
| `*` (default) | `@your-team/engineers` | Any engineer can review ordinary changes |
| `.claude/hooks/`, `src/lib/env.ts`, `src/lib/api-client.ts`, `src/features/auth/`, `app/api/`, `next.config.ts` | `@your-team/leads` | Security-sensitive: auth, token handling, env, headers |
| `src/types/api.generated.ts` | `@your-team/leads` | Contract drift / accidental hand-edit (file is generated) |
| `.github/workflows/`, `Dockerfile` | `@your-team/platform` | CI/CD and container surface |

> Replace the placeholder team slugs in `CODEOWNERS` with real GitHub teams/usernames,
> then tick "Require review from Code Owners" above. Until then they are inert.

## Approve vs merge

- **Approve**: any code owner for the touched paths.
- **Merge**: the PR author after all required approvals + green checks, using
  **Squash and merge**. The squash title must follow conventional commits
  (`feat(scope): …`) — enforced locally by the commit-msg hook and reviewed against
  the PR template.

## Local quality gates (run before you push)

The harness enforces these automatically; this is what runs and when:

| When | What | How |
|---|---|---|
| On save (optional) | format + eslint | editor / `npm run format` |
| On `git commit` | eslint --fix + prettier on staged files | Husky `pre-commit` → `lint-staged` |
| On `/build-layer` | full layer gate (PASS/FAIL) | `gate-checker` agent |
| On PR | typecheck, lint, format check, tests+coverage, build | `.github/workflows/ci.yml` |
| On UI PR | Core Web Vitals budget | `.github/workflows/lighthouse.yml` |

## Definition of done for a PR

- Gate is green (`/validate-layer` passes locally).
- CI is green.
- PR template fully checked, including the **cross-user isolation test** for any new
  user-owned resource.
- An ADR exists for any non-obvious decision (`docs/design-docs/decisions/`).
