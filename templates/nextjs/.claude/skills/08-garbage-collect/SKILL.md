# /garbage-collect — End-of-Feature Cleanup

Triggered by: /garbage-collect

Calls garbage-collector agent which:
1. Scans file size violations and splits files > 400 lines
2. Removes unnecessary use client directives
3. Runs TypeScript + ESLint --fix
4. Updates stale docs
5. Updates QUALITY_SCORE.md
6. Logs tech debt
7. **Grades the outcome (AC vector) — then** closes plan (active/ to completed/)
8. Marks spec SHIPPED
9. Final commit + push

---

## Grade the outcome, not the checkboxes (AC vector — do this before closing the plan)

Checking every layer box off is not "done": the feature is done only when every `AC-N` in
the spec is PASS. Run the feature-completion check, which runs the spec's acceptance-test
holdout (via `vitest.acceptance.config.ts`) and asserts each `AC-N` is PASS (test exists,
was proven red, now green):

```bash
npm run ac:vector   # exits non-zero unless every AC is PASS; appends the vector to the plan
```

Do NOT close the plan while any AC is FAIL / MISSING / INVALID — those are unmet criteria,
not paperwork:
- **FAIL** — the acceptance test is still red → fix the implementation.
- **MISSING** — no acceptance test titled with that AC-id → the AC was never scaffolded.
- **INVALID** — a test exists but has no recorded red state → re-run `/write-spec`'s
  red-green step for it during a fresh spec phase.

If a criterion is genuinely dropped, remove its AC in the spec and its acceptance test during
a fresh spec phase (the holdout hook blocks editing acceptance tests otherwise) — do not just
close over it. Re-run `npm run ac:vector` until it is green, then close the plan.

(The per-layer gate only enforces the STATIC arch checks — traceability +
assertion-integrity — so acceptance tests are legitimately red mid-build; this vector is the
one place their green state is required.)

---

## Advisory spec-judge (log-only, never blocks)

The AC vector proves the *named* criteria pass; it cannot judge whether the spec's **intent**
was honored or the **abstraction** is right. After the vector is green, run the advisory judge:

- Call the `spec-judge` agent. It reads ONLY the spec + the feature diff (never this transcript),
  and appends an `### spec-judge (ADVISORY — non-blocking)` block to the active plan with a
  per-AC + intent + abstraction verdict, routing anything UNKNOWN to `.rigel/judge-review-queue/`.

This is **advisory**: it does NOT gate plan-close. Do not fix code just to satisfy the judge and
do not skip closing because of a judge FAIL — surface its block to the human. (The judge stays
log-only until a calibration report promotes a dimension to blocking.)
