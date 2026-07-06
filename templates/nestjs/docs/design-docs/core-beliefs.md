# Core Beliefs — The Engineering Constitution

1. **The Repo Is Reality** — if not committed, it doesn't exist
2. **Enforce Mechanically** — linter rules + hooks > documentation
3. **Agents Execute, Humans Steer** — escalate only when judgment is needed
4. **Layers Protect Concerns** — controllers delegate, services have no HTTP, repos have no logic
5. **External Data Is Adversarial** — Zod parse every .toJSON() at the repo boundary
6. **Gate Before Commit** — TypeScript + ESLint + tests before every push
7. **Observability Is Not Optional** — structured logs on every service boundary
8. **Small, Boring, Legible** — 400-line limit, NestJS idioms, no premature abstraction
9. **Technical Debt Is a High-Interest Loan** — log it immediately, pay daily
10. **The Fix Is Never Try Harder** — repeated failure = missing rule, tool, or abstraction

## NestJS-Specific Beliefs
- Auth is opt-out (global guard) — not opt-in
- ValidationPipe is the input contract — not manual Zod on inputs
- Swagger is auto-generated — no separate file sync needed
- Inject repositories into services — not models directly
