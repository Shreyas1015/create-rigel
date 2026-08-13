# Rate limiting

Every public endpoint is called at whatever rate a client feels like, including a client with a bug
and a client that is hostile. Rate limiting is how a system stays available for everyone else.

## What to limit by

Limiting by IP is the weakest useful option: it punishes shared networks and is trivially evaded.
Limit by authenticated principal where you have one, and reserve IP limits for unauthenticated
routes. Expensive endpoints — search, export, anything fanning out — often need their own budget
rather than sharing the global one.

## Choosing the algorithm

A **fixed window** is simplest and allows a burst of double the limit across a boundary. A **sliding
window** removes that at the cost of more state. A **token bucket** allows a deliberate burst then
enforces a steady rate, which usually matches how clients actually behave. Pick for the traffic shape
you expect, and write down which one — the burst behaviour differs and it will surprise someone.

## State has to be shared

A limit enforced per process is not the limit you configured; it is that number multiplied by your
instance count, and it changes when you scale. Shared state — commonly Redis — is what makes the
number mean something.

## Tell the client

Return `429` with `Retry-After`, and expose the limit and remaining budget in headers. A client that
cannot see the limit cannot back off correctly, so it retries, which is the problem the limit exists
to solve.

## How it is usually got wrong

- Per-process counters behind a load balancer.
- One global limit for endpoints whose costs differ by orders of magnitude.
- Rejecting with no `Retry-After`, so well-behaved clients retry immediately.
- Rate limiting treated as a substitute for authorization — it slows an attacker, it does not stop
  one.

## Standard

OWASP ASVS: Business Logic and Denial of Service. Google SRE Book: Handling Overload.
