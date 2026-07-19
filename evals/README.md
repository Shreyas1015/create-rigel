# evals/ — Golden set + judges (PLAN-004)

This harness lives in the create-rigel repo and evaluates **Rigel's own templates** (not user
projects). It is repo-level and **not published** (`package.json` `files` excludes `evals/`).
Everything here is plain, zero-dependency Node.

## What's here

```
golden-specs/<id>/{spec.md, meta.json, reference/grade.json}   frozen specs + green reference proof
harness/
  lib/eval-lib.mjs        Cohen's κ, two-sided sign test, stratified sampling, pass^k, IO
  load-golden.mjs         AC-5: "no green reference, no entry" loader
  score.mjs               AC-6: k trials → per-check vector + pass^k (ERRORED ≠ FAILED)
  regress.mjs             AC-7: REGRESSED iff fail ≥2/3 AND baseline passed^k; issue payload
  champion.mjs            AC-8: paired sign-flip over two harness commits → block/review/deploy
  calibrate.mjs           AC-3: per-dimension κ; deterministic-overlap bootstrap; solo→reduced-confidence
  promotion-check.mjs     AC-4: CI gate — a blocking judge dimension needs a fresh, eligible report
  parity.mjs              AC-9: grader opus-vs-cheaper κ (cost-down; data-gated)
config/judge-config.json  per-dimension advisory|blocking + cited report (judges start advisory)
calibration/              committed calibration reports (proof); sets/ hold labeled inputs
trials/                   committed trial outputs; trials/fixtures/ drive the tamper tests
```

Run all deterministic checks: `npm run test:evals` · promotion gate: `npm run eval:promote-check`
(both run in `.github/workflows/repo-integrity.yml`).

## Operational protocol

- **Calibration order (do not skip):** human-vs-human κ FIRST (rubric validation). If two raters
  can't agree (κ < 0.4) the rubric is broken — rewrite it before judging the judge. Then
  judge-vs-human κ **per dimension, never pooled**.
- **Bootstrap for free:** dimensions that overlap the deterministic AC vector
  (`.rigel/ac-results/*.json`) take their reference label from that vector — no human labeling.
  Human labels are spent ONLY on judge-exclusive dimensions (intent, abstraction, layout).
- **Stratify** the calibration set ~50/50 per dimension (50 balanced / 200+ if the positive
  class is rare) so κ isn't dominated by the majority class.
- **Judge model is pinned** (`opus`) — a deliberate exception to the no-pins rule, because judge
  drift on version bumps silently shifts scores. Any bump triggers recalibration.
- **Judge = opus, builder = sonnet:** same family, so self-preference is only partially
  mitigated. Every calibration report records this caveat.
- **Isolation:** each trial runs in clean state (no shared git history / caches).
- **Budgets:** a per-trial token budget; a breach ABORTS the trial and marks it **ERRORED**, not
  FAILED — infra flakes and budget aborts must never read as agent regressions.
- **Promotion is mechanical:** a judge dimension can go `blocking` only via a `judge-config.json`
  change citing a calibration report that `promotion-check.mjs` accepts (present, ≤90 days,
  κ ≥ threshold). Judges are advisory until then.

### Solo-maintainer note (current state)

With a single labeler, human-vs-human κ cannot be established, so judge-exclusive dimensions stay
**reduced-confidence** and **advisory** — `calibrate.mjs` records "single rater, κ not
established" rather than fabricating one, and `promotion-check.mjs` keeps those dimensions out of
any blocking config. Only the deterministic-overlap (bootstrap) dimension can be promoted solo.

## Deferred (infra/API-heavy — not built in this pass)

- **Reference solutions** for the three golden specs (each is a full app that must grade green;
  needs Docker+Postgres+Redis / `uv` / `create-next-app`). Until built, `load-golden.mjs`
  refuses to admit the specs — the set stays honest.
- **`run-trial.mjs`** live runner (headless agent execution + `ANTHROPIC_API_KEY` + token budget)
  and the **golden nightly workflow**. The scoring/regression/champion/calibration/parity
  machinery is complete and fully tested on fixtures; only the *generation* of live trials is
  deferred.
