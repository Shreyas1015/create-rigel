# Core Beliefs — The Engineering Constitution

Rules without reasons get bent under pressure.
This document explains the WHY behind every constraint in this harness.

---

## 1. The Repo Is Reality

If a decision isn't written in this repository, it doesn't exist.
Slack messages, verbal agreements, and meeting notes are invisible to agents and to future engineers.

**Consequence:** Every architectural decision → ADR. Every product → `ROADMAP.md`. Every feature intent → spec. Every execution plan → PLAN-XXX.md.

---

## 2. Enforce Mechanically, Not Aspirationally

A linter rule that blocks CI is worth ten documentation paragraphs.
Agents respond to feedback in their context window — linter errors are that feedback.

**Consequence:** Every constraint that matters is encoded as an ESLint rule, a structural test, or a hook. Not just a doc.

---

## 3. Agents Execute. Humans Steer.

Human attention is the scarcest resource. Every minute spent writing boilerplate is a minute not spent on product quality.

**Consequence:** The harness is optimised for maximum agent autonomy. Escalations happen only when judgment is required — not when tasks are hard.

---

## 4. Layers Protect Business Logic

The layer architecture isn't aesthetic. It exists so business logic can be tested, ported, and reasoned about in isolation — without spinning up HTTP, a database, or any external dependency.

**Consequence:** Service methods take domain types and return domain types. No `Request`, no `Response`, no HTTP concepts.

---

## 5. External Data Is Adversarial Until Proven Otherwise

TypeScript's type system tells you what you expect — not what you got.
APIs change. DB schemas get migrated. Payloads get spoofed.

**Consequence:** `Schema.parse(raw.toJSON())` at every external data boundary. `as SomeType` is forbidden on external data.

---

## 6. Observability Is Not Optional

When something breaks in production, structured logs + traces are the only way to reproduce it without live debugging. Agents can query logs to fix bugs autonomously — but only if the logs exist.

**Consequence:** Structured JSON logging and OTel spans on every service boundary. No silent operations.

---

## 7. Gate Before Commit — Always

Shipping code that violates the harness compounds over time. Every violation makes the next one cheaper to introduce.

**Consequence:** The gate-checker runs after every layer. It must PASS before any commit is made. Auto-fix is enabled — there's no reason to leave violations unfixed.

---

## 8. Small, Boring, Legible

Agents reason best about code they can fully read in a single context window.
400 lines is the cognitive limit. Boring technology has more training data and fewer surprises.

**Consequence:** 400-line hard limit. Prefer well-known libraries. No premature abstraction.

---

## 9. Technical Debt Is a High-Interest Loan

Every shortcut taken today costs more to fix when built upon.
Log debt immediately. Pay it in small amounts daily.

**Consequence:** `tech-debt-tracker.md` is updated after every feature. Garbage collection runs after every plan completes.

---

## 10. The Fix Is Never "Try Harder"

Repeated failures indicate a missing capability — a missing tool, constraint, or abstraction.

**Consequence:** When the same problem recurs: diagnose the missing capability → build it → solve it permanently. Build the abstraction before writing the third hand-rolled copy.
