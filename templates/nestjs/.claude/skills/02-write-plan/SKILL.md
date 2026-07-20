# /write-plan
1. Check docs/product-specs/ready/ — stop if empty
2. Get next plan number

### Step 2b — Enforce the acceptance-test precondition

A spec may not be planned unless its acceptance tests exist and were proven red. For the
chosen `SPEC-XXX`, verify both before continuing:

```bash
# 1. Every AC-N in the spec has an acceptance test titled with its id.
test -d tests/acceptance/SPEC-XXX || { echo "BLOCK: no tests/acceptance/SPEC-XXX — run /write-spec's scaffolding step"; exit 1; }
# 2. The red-green proof was recorded pre-implementation.
test -f .rigel/redgreen/SPEC-XXX.json || { echo "BLOCK: no .rigel/redgreen/SPEC-XXX.json — run: npm run redgreen:record -- SPEC-XXX"; exit 1; }
```

If either is missing, **stop** and tell the human the spec is not eligible: its acceptance
tests / red-green proof must be created by `/write-spec` first (the `tests/architecture/`
traceability test would otherwise fail the very first gate). Do not hand-create these here —
they belong to the spec phase and the holdout hook blocks writing them outside it.

3. Write to docs/exec-plans/active/PLAN-XXX-{slug}.md

The plan MUST carry a `**Spec:**` line pointing at the READY spec file — the deterministic-eval
scripts (`redgreen:record`, `ac:vector`) and `tests/architecture/` resolve the active plan → its
spec → the AC ids through exactly that line, so it is not optional:

```markdown
# PLAN-XXX — {Name}

**Status:** IN_PROGRESS
**Spec:** docs/product-specs/ready/SPEC-XXX-{slug}.md
**Created:** YYYY-MM-DD
**Completed:** —
```

Also copy the spec's Acceptance Criteria (with their `AC-N` ids) into the plan so the vector at
feature-completion has them in the Progress Log.

Layer order for each NestJS feature:
| # | Layer | Gate |
|---|---|---|
| 1 | Model | paranoid, UUIDv7, indexes |
| 2 | Migration | runs clean, has down() |
| 3 | DTOs | class-validator + @ApiProperty on every field |
| 4 | Repository | Zod parse, cursor pagination, ownership, no N+1 |
| 5 | Service | no HTTP, NestJS exceptions, ≥90% coverage |
| 6 | Controller | @ApiTags, @ApiOperation, @ApiResponse, one-liner handlers |
| 7 | Module | SequelizeModule.forFeature, registered in AppModule |
| 8 | Tests | service unit (mock repo) + e2e (201, 401, 422) |

4. **Cut the feature branch** from `main` (never build on `main` — it's protected), matching the
   policy pattern `^(feat|fix|chore|hotfix)/PLAN-\d{3}-[a-z0-9-]+$`, same `PLAN-XXX-{slug}`:
   ```bash
   trunk=$(sed -n 's/.*"trunk"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .rigel/git-policy.json)
   git switch "$trunk" && git pull --ff-only origin "$trunk" 2>/dev/null || true
   git switch -c feat/PLAN-XXX-{slug}
   ```
   `/build-layer` commits + pushes this branch each layer; `/open-pr` lands it on `main`.
5. In `docs/product-specs/ready/SPEC-XXX.md`, append `PLAN-XXX` to the `**Plan:**` field.
6. Tell human: Run /build-layer to start Layer 1.
