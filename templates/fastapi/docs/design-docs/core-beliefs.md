# Core Beliefs — The Engineering Constitution

Rules without reasons get bent under pressure.
This document explains the WHY behind every constraint in this harness.

---

## 1. The Repo Is Reality
If a decision isn't written here, it doesn't exist. Verbal agreements and Slack messages are invisible to agents and future engineers.
**Consequence:** Every decision → ADR. Every product → ROADMAP.md. Every intent → spec. Every plan → PLAN-XXX.md.

## 2. Enforce Mechanically, Not Aspirationally
A ruff rule that blocks CI is worth ten documentation paragraphs. Agents respond to linter output.
**Consequence:** Every constraint is a ruff rule, a structural test, or a hook — not just a doc.

## 3. Agents Execute. Humans Steer.
Human attention is the scarcest resource. Optimize everything around preserving it.
**Consequence:** Maximum agent autonomy. Escalate only when judgment is needed.

## 4. Layers Protect Business Logic
Service layer is pure business logic. No HTTP, no FastAPI, no ORM models. It receives an injected `AsyncSession` and orchestrates repos — testable against a real test session, no web-layer mocks.
**Consequence:** `raise HTTPException` only in runtime. Services raise `DomainError`. ORM models and `session.add` live only in the repo layer.

## 5. External Data Is Adversarial Until Validated
SQLAlchemy row `__dict__` is untyped. Pydantic `model_validate()` is the gate.
**Consequence:** `Schema.model_validate(row.__dict__)` at every repo boundary. No raw dicts.

## 6. Observability Is Not Optional
Structured logs + traces are the only way to reproduce production bugs autonomously.
**Consequence:** structlog on every service boundary. OTel spans on every DB query.

## 7. Gate Before Commit — Always
Every layer gated before commit. Auto-fix enabled — no reason to leave violations in.
**Consequence:** gate-checker runs after every layer. PASS required before push.

## 8. Small, Boring, Legible
400 lines max. Well-known libraries. No premature abstraction.
**Consequence:** uv, FastAPI, SQLAlchemy — widely used, well-documented, excellent agent training data.

## 9. Technical Debt Is a High-Interest Loan
Log debt immediately. Pay it in small daily amounts.
**Consequence:** tech-debt-tracker.md updated after every feature. Garbage collect after every plan.

## 10. The Fix Is Never "Try Harder"
Repeated failures indicate a missing capability — tool, constraint, or abstraction.
**Consequence:** Diagnose → build the capability → solve permanently.
