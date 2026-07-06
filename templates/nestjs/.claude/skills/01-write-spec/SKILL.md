# /write-spec
1. Get next number: ls docs/product-specs/{draft,ready}/ 2>/dev/null | grep SPEC | sort | tail -1
2. Write to docs/product-specs/draft/SPEC-XXX-{slug}.md

Template:
```markdown
# SPEC-XXX — {Name}
**Status:** DRAFT
**Created:** YYYY-MM-DD
**Plan:** —

## Problem Statement
## What We're Building
## Core Entities
## API Endpoints (will map to NestJS controllers)
## Business Rules
## State Machines (if any)
## Non-Functional Requirements
## Out of Scope (v1)
## Acceptance Criteria
- [ ] criterion
```

3. Update docs/product-specs/index.md
4. Tell human: move to ready/ and change Status to READY, then run /write-plan.
