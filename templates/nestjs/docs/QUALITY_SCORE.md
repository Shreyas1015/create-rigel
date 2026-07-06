# QUALITY_SCORE.md — Domain Health Grades

Updated by /garbage-collect after every feature.

## Grading
| Grade | Meaning |
|---|---|
| A | All invariants met, ≥ 90% service coverage, zero debt |
| B | Minor issues, ≥ 80% coverage, low-priority debt logged |
| C | Layer violation OR < 80% OR unresolved medium debt |
| D | Multiple violations, active bugs |

## Architecture Health
| Check | Status |
|---|---|
| No cross-layer imports | — |
| No files > 400 lines | — |
| No process.env outside config | — |
| No console.log in src | — |
| No HttpException in services | — |
| No @InjectModel in services | — |
| Zod parse on all .toJSON() in repos | — |

## Domain Grades
| Domain | Grade | Coverage | Last Updated |
|---|---|---|---|
| *(none yet)* | — | — | — |
