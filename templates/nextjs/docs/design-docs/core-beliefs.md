# Core Beliefs — The Engineering Constitution

Rules without reasons get bent under pressure.

## 1. The Repo Is Reality
If it isn't in this repository, it doesn't exist.
**Consequence:** Every decision → ADR. Every product → ROADMAP.md. Every intent → spec. Every plan → PLAN-XXX.md.

## 2. The API Contract Is the Source of Truth
api.generated.ts is generated from the backend OpenAPI spec. Never hand-write types that duplicate it.
**Consequence:** /api-sync runs before every feature. TypeScript errors after sync = contract drift to fix.

## 3. Hooks Are the Only API Gateway
No component or page calls fetch() directly. All API calls go through TanStack Query hooks in src/hooks/.
**Consequence:** One place to add auth headers, one place to handle errors, one place to add retries.

## 4. Enforce Mechanically, Not Aspirationally
ESLint rules, hooks, and structural tests enforce the architecture. Docs alone do not.
**Consequence:** Every constraint is a linter rule, a hook warning, or a failing test.

## 5. Server Components Are the Default
Every component is a Server Component unless it explicitly needs browser APIs or React hooks.
**Consequence:** Every 'use client' directive requires a comment explaining why.

## 6. Layers Protect Concerns
Features don't call fetch(). Pages don't contain business logic. Utils don't import domain code.
**Consequence:** ESLint import rules + structural tests enforce this mechanically.

## 7. Tokens Live in Memory
Access tokens are stored in React context only. Never localStorage, never sessionStorage.
**Consequence:** Post-hook catches this. Tokens are wiped on page refresh by design (refresh token in httpOnly cookie handles re-auth).

## 8. All Three States, Every Time
Every component that fetches data must handle: loading, error, and empty. Silence is not acceptable.
**Consequence:** Gate-checker scans for isPending/isError patterns on data-fetching components.

## 9. Gate Before Commit — Always
TypeScript must compile. ESLint must pass. Architecture tests must pass. Before every commit.
**Consequence:** /push-layer runs typecheck + lint before committing. No exceptions.

## 10. Technical Debt Is a High-Interest Loan
Log debt immediately. Pay it in small daily amounts. Garbage collect after every feature.
**Consequence:** tech-debt-tracker.md updated after every feature.
