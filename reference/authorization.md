# Authorization

Authentication answers *who is this*. Authorization answers *may they do this, to this record*.
Conflating them is the most common serious defect in an API, because the tests pass either way.

## Why guessing this is uniquely expensive

An invented authorization rule produces a security bug that passes every test you wrote — because
you wrote the tests from the same wrong assumption. No amount of coverage catches it. This is why
`/write-design` requires the decision explicitly rather than inferring it.

## Object-level authorization

The check that matters is not "is this user logged in" but "does this user own *this* record".
OWASP ranks broken object-level authorization as the top API risk. A route handler that reads an id
from the path and returns the row without comparing ownership is the canonical form.

Decide, per endpoint: **who may act on whose rows** — the owner only, the owner and admins, anyone
in a shared tenant, or the public.

## Where the check belongs

Put it in the layer that owns the data, not the route. A check in the route is bypassed the moment a
second caller — a worker, a batch job, an internal service — reaches the same repository. Scoping
queries by owner in the repository makes the safe path the default one.

## Roles versus attributes

Role-based access is simpler and adequate when permissions cluster into a handful of job functions.
Attribute-based access is warranted when the decision depends on the record's state — its owner, its
tenant, its lifecycle stage. Starting with roles and adding record-level ownership checks covers most
systems; a full policy engine is rarely the first move.

## How it is usually got wrong

- Checking authentication and calling it authorization.
- Enforcing in the route, then adding a second caller that skips it.
- Trusting a client-supplied id — a tenant id in a request body is a claim, not a fact.
- Leaking existence through status codes: `404` and `403` tell an attacker different things.

## Standard

OWASP Application Security Verification Standard, Access Control. OWASP API Security Top 10:
Broken Object Level Authorization.
