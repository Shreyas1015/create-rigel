# QUALITY_SCORE.md — Domain Health Grades

Updated by /garbage-collect after every feature.

## Grading Rubric
| Grade | Meaning |
|---|---|
| A | All invariants met, coverage above threshold, zero known debt |
| B | Minor issues, coverage at threshold, low-priority debt logged |
| C | Layer violation OR coverage below threshold OR unresolved debt |
| D | Multiple violations, significant coverage gaps |

## Architecture Health
| Check | Status |
|---|---|
| No cross-layer imports | — |
| No files > 400 lines | — |
| No process.env outside env.ts | — |
| No console.log in src/ | — |
| No direct fetch() in components | — |
| api.generated.ts not manually edited | — |
| Utils: 100% test coverage | — |

## Design Health (PLAN-005)
| Check | Status |
|---|---|
| No arbitrary values / off-token classes (eslint-plugin-tailwindcss) | — |
| No design slop (Impeccable slop tier — post-write blocker) | — |
| Rendered styles conform to tokens.json (token-conformance) | — |
| Every impeccable-disable waiver carries a reason (waivers:check) | — |

**Design waiver count:** run `npm run waivers:check` — it reports the total number of
`impeccable-disable` waivers, all of which MUST carry a reason (PLAN-005 AC-4). Record the
count here each feature; a rising count is design debt to review.

## Domain Grades
| Domain | Grade | Coverage | Last Updated | Notes |
|---|---|---|---|---|
| *(no domains yet)* | — | — | — | — |
