# ADR-000 — Infrastructure & Stack Choices

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** Phase 0

---

## Context
Starting a new Next.js frontend project. Stack choices made here are expensive to change.

---

## Decisions

### Framework: Next.js 16.2 + React 19.2
- Next.js 16 is the current stable with React Compiler stable
- App Router (not Pages Router) — RSC, streaming, better performance
- React Compiler enabled — automatic memoisation, zero manual useMemo/useCallback
- Turbopack as bundler — significantly faster dev server than Webpack
- Alternatives rejected: Remix (less ecosystem), Vite SPA (no SSR/RSC benefits)

### API Contract: openapi-typescript + openapi-fetch
- openapi-typescript generates types from backend OpenAPI spec — zero runtime overhead
- openapi-fetch: type-safe fetch client, 6kb, infers types from generated schema
- Together: full end-to-end type safety from backend response to component props
- Alternatives rejected: axios (no OpenAPI integration), React Query with manual types (error-prone)

### Server State: TanStack Query 5
- Industry standard for async server state management
- Built-in caching, background refetch, optimistic updates, devtools
- Version 5: simplified API (one object argument), smaller bundle
- Alternatives rejected: SWR (less features), Redux RTK Query (more boilerplate)

### Client State: Zustand 5
- Minimal (~1kb), TypeScript-native, no boilerplate
- Used ONLY for UI state that genuinely belongs on the client (sidebar, modals)
- NOT for server data — that's in TanStack Query
- Alternatives rejected: Redux (overkill), Jotai (less ecosystem), Context (re-render issues)

### Components: shadcn/ui
- Copy-owned model — components are in your repo, you control them
- Built on Radix UI primitives (accessibility built-in)
- Tailwind CSS 4 styling — no runtime CSS-in-JS
- No upgrade hell — you own the code
- Alternatives rejected: MUI (heavy, hard to customise), Chakra (JSX props model)

### Forms: React Hook Form 7 + Zod 3
- React Hook Form: uncontrolled, minimal re-renders, best performance
- Zod: same validation library as backend — consistent error messages
- @hookform/resolvers bridges them
- Alternatives rejected: Formik (slow, too many re-renders), Yup (less TypeScript support)

### Testing: Vitest 4 + Playwright + MSW 2
- Vitest 4: 3.8x faster than Jest, native TypeScript, same Jest API
- Playwright: E2E + visual regression in one tool, 80%+ new project adoption
- MSW 2: intercept at network level, works in both browser and node
- Alternatives rejected: Jest (slower), Cypress (less capable than Playwright)

### Auth Token Strategy
- Access token in React context (memory) — wiped on refresh
- Refresh token in httpOnly cookie (set by backend) — never accessible to JS
- On 401: call /api/auth/refresh → backend reads cookie → issues new access token
- No localStorage/sessionStorage — XSS attack surface reduction

---

## Consequences
- openapi-typescript: api.generated.ts is READ ONLY — must regenerate on backend changes
- React Compiler: no manual useMemo/useCallback needed (but don't remove existing ones without testing)
- Server Components: most pages are async by default — data fetching happens at render time on server
- Zustand for UI only: if it lives in TanStack Query cache, don't duplicate in Zustand
