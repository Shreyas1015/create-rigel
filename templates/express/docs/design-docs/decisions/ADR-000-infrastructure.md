# ADR-000 — Infrastructure & Stack Choices

**Status:** ACCEPTED
**Date:** *(fill when /infra-setup is run)*
**Plan:** Phase 0

---

## Context

Starting a new TypeScript backend project. Need to select the foundational stack for the long term.
Choices made here are expensive to change later.

---

## Decisions

### Runtime: Node 24 LTS + TypeScript 5
- Node 24 is the current LTS — stable, long support window
- TypeScript 5 with `strict: true` — `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` catch a class of bugs TypeScript 4 missed

### Framework: Express 5
- Express 5 is finally stable — async error propagation built-in (no need for `express-async-errors` wrapper in future)
- Widest ecosystem, most agent training data, most Stack Overflow coverage
- Alternatives considered: Fastify (better performance, less ecosystem), Hono (newer, less mature)

### ORM: Sequelize 6 + sequelize-typescript
- Team already familiar
- `paranoid: true` soft deletes built-in
- sequelize-cli provides robust migration tooling
- Stable v6 release with proven production track record
- Alternatives considered: Prisma (better DX, but generates its own runtime, less control), Drizzle (very new)

### Auth: jose 5 (JWT)
- Zero CVE history (unlike `jsonwebtoken`)
- Web Crypto API — runs in any JS runtime
- Alternatives rejected: `jsonwebtoken` — has had multiple CVEs

### Password Hashing: argon2
- Winner of the Password Hashing Competition (2015)
- Resistant to GPU/ASIC attacks
- Alternatives rejected: bcrypt — vulnerable to GPU attacks at high parallelism

### Queue: BullMQ 5 + Redis
- Most mature Redis-backed queue in Node ecosystem
- Built-in retry, backoff, rate limiting, delayed jobs
- Alternatives considered: `pg-boss` (Postgres-backed, fewer deps), SQS (infrastructure dependency)

### Logging: pino 9
- Fastest structured JSON logger in Node ecosystem (~5x faster than winston)
- Built-in redaction
- Alternatives rejected: winston — slow, complex config

### Validation: Zod 3
- TypeScript-first, infers types from schemas
- Used at every external data boundary
- Alternatives considered: Yup (less TypeScript-native), io-ts (too verbose)

### Caching/Sessions: ioredis 5
- Most stable Redis client for Node
- Used for: rate limiting, token revocation, job queues, application cache

---

## Consequences

- Express 5 async errors: built-in async error propagation to `errorHandler` middleware
- Sequelize + `paranoid: true`: never hard-delete unless explicitly using `{ force: true }`
- jose: tokens are stateless — revocation requires Redis check on every verify
- argon2: slower than bcrypt on CPU (that's a feature, not a bug — harder to brute-force)
