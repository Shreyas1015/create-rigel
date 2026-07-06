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

## Domain Grades
| Domain | Grade | Coverage | Last Updated | Notes |
|---|---|---|---|---|
| *(no domains yet)* | — | — | — | — |
