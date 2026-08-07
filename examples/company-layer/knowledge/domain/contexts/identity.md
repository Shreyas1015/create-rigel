# Bounded context: identity

Owns accounts, sessions, and tokens. **Does not own** permissions (that is each service's own
concern) or customer billing identity (that is `billing`).

Invariants:
- A token is never logged, not even truncated.
- Email is not an identifier — the immutable `userId` is.
