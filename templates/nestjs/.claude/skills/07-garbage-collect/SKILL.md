# /garbage-collect
Calls garbage-collector agent.

gc is the **last step before `/open-pr`**: the agent commits + pushes on the **current feature
branch** (never `main`, which is PR-only protected), so its cleanup rides the feature's PR onto `main`.

Before closing the plan, grade the OUTCOME, not the checkboxes — run the AC vector, which runs
the spec's acceptance tests and asserts every `AC-N` is PASS (test exists, was proven red, now
green):

```bash
npm run ac:vector   # exits non-zero unless every AC is PASS; appends the vector to the plan
```

Do NOT close the plan while any AC is FAIL / MISSING / INVALID — those are unmet criteria, not
paperwork. Fix the code (or, if a criterion is genuinely dropped, remove its AC in the spec and
its acceptance test during a fresh spec phase) and re-run. The per-layer gate only enforced the
STATIC invariants (`tests/architecture/`); this green pass/fail vector is the feature-completion
check.

## Advisory spec-judge (log-only, never blocks)

The AC vector proves the *named* criteria pass; it cannot judge whether the spec's **intent** was
honored or the **abstraction** is right. After the vector is green, call the `spec-judge` agent: it
reads ONLY the spec + the feature diff (never this transcript) and appends an
`### spec-judge (ADVISORY — non-blocking)` block to the active plan with a per-AC + intent +
abstraction verdict, routing anything UNKNOWN to `.rigel/judge-review-queue/`. It is **advisory** —
it does NOT gate plan-close; surface a judge FAIL to the human rather than acting on it. (Log-only
until a calibration report promotes a dimension to blocking.)

## Curate lessons — run `/curate` (before closing the plan)

Fold this feature's recorded gate failures into the lesson memory: run **`/curate`**. It reads
`.rigel/gate-failures.jsonl`, groups by signature, increments `seen` on existing lessons or
creates new `OBSERVED` ones, and flags any `seen >= 3` + `DISTILLED` lesson as **promotion-ready**
(writing nothing outside `docs/design-docs/lessons/`). Surface any promotion-ready lesson to the
human so they can enforce it — `/curate` never promotes on its own. See
`docs/design-docs/memory.md`.
