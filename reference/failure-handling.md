# Failure handling

Every call that leaves the process can fail, hang, or succeed too late to matter. A design that does
not say what happens then has decided by omission: it will hang.

## Timeouts come first

An unbounded call is the failure that takes a system down, because one slow dependency consumes
every worker waiting on it. Every outbound call needs an explicit timeout, and it should be derived
from what the caller can afford to wait, not from what the dependency usually takes.

## Retries need three things

A retry policy without a bound amplifies an outage into an outage plus a stampede. Decide all three:

- **How many attempts** — a small bound, not "until it works".
- **Backoff with jitter** — exponential backoff alone synchronises every client into retrying in
  lockstep. Jitter is what spreads them.
- **What is retryable** — timeouts and 5xx, generally. Retrying a 400 repeats a request that was
  wrong the first time.

Retries and idempotency are one decision, not two: retrying a non-idempotent write is how duplicates
are created deliberately.

## Failing fast when a dependency is down

Once a dependency is failing, continuing to send it traffic delays its recovery and burns your own
capacity. A circuit breaker stops calls after a failure threshold and probes periodically. Worth it
for dependencies with real failure rates; unnecessary ceremony for a local database.

## Degrade deliberately

Decide what the system does when a dependency is unavailable: serve stale data, serve a reduced
response, queue the work, or fail the request. Any of these can be right. What is never right is
each call site choosing differently by accident.

## How it is usually got wrong

- A retry loop with no bound, no backoff, and no jitter.
- Catching the error and returning an empty list, so a failure is indistinguishable from no data.
- Timeouts set per library default, differing across the codebase.
- A circuit breaker with no path back to closed.

## Standard

Google SRE Book: Handling Overload, Addressing Cascading Failures. AWS Well-Architected,
Reliability Pillar.
