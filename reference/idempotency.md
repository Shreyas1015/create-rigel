# Idempotency

An operation is idempotent when performing it twice leaves the same state as performing it once.
Networks retry. Mobile clients retry. Load balancers retry. If a non-idempotent write is exposed
without a dedupe strategy, duplicates are not a risk — they are a certainty.

## What the HTTP spec already fixes

`GET`, `HEAD`, `PUT` and `DELETE` are defined as idempotent; `POST` is not. That is a contract with
every intermediary on the path, so a `PUT` that is not actually idempotent will be retried by
something you do not control. Decide idempotency for every non-`GET` endpoint.

## The three mechanisms

**Natural idempotency.** The operation is already safe to repeat — setting a field to a fixed value,
or a delete that tolerates an absent row. Cheapest, and worth reshaping an endpoint to reach.

**A unique constraint.** A database constraint on the natural key turns a duplicate into a caught
error rather than a second row. This is the final safety net and it holds even when application
logic is bypassed.

**An idempotency key.** The client sends a unique key; the server records it with the result and
replays that result on a repeat. Necessary when the operation has external side effects — a charge,
an email, a third-party call — that a constraint cannot undo.

## Deciding the window

An idempotency key needs a retention period. Too short and a delayed retry creates a duplicate; too
long and storage grows without bound. Match it to the longest realistic client retry, commonly hours
rather than minutes, and state it — an unstated window becomes whatever the cache eviction policy
happens to be.

## How it is usually got wrong

- Storing the key but not the response, so a retry returns a different body.
- Recording the key after the side effect rather than before, leaving a crash window.
- Assuming a natural key is unique when the domain legitimately repeats it — a candidate reapplying
  after rejection is a new application, not a duplicate.

## Standard

RFC 9110, HTTP Semantics: idempotent methods. AWS Well-Architected, Reliability Pillar.
