# QUALITY_SCORE.md — Domain Health Grades

Updated by /garbage-collect after every feature.

## Grading Rubric
| Grade | Meaning |
|---|---|
| A | All invariants met, ≥ 90% coverage, zero known debt |
| B | Minor issues, ≥ 80% coverage, low-priority debt logged |
| C | Layer violation OR < 80% coverage OR unresolved medium debt |
| D | Multiple violations, < 70% coverage, active bugs |
| F | Blocking issues, data integrity risk, security concern |

## Architecture Health
| Check | Status |
|---|---|
| No circular imports | — |
| No files > 400 lines | — |
| No os.environ outside config | — |
| No print() in src/ | — |
| Utils: 100% test coverage | — |

## Domain Grades
| Domain | Grade | Coverage | Last Updated | Notes |
|---|---|---|---|---|
| *(no domains yet)* | — | — | — | — |
