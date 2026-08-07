---
id: LSN-0012
summary: "First-run environment gaps (no .env, Actions off) break new users even when every component passes."
status: DISTILLED
seen: 3
first_seen: PLAN-006
last_seen: PLAN-009
signatures: []
enforced_by: null
---
## What went wrong
A fresh scaffold shipped `.env.example` but no `.env`, and `env.ts` `exit(1)`s without one, so a
clean builder couldn't run infra-setup's own steps (DF-42). Fresh GitHub repos on the account don't
fire push/PR Actions until enabled in the UI, so a new user's first push shows no CI (DF-30).

## Why it happens
Component tests run in an already-configured environment. The *first-run* path — no `.env`, Actions
not yet enabled — is exactly the path no component test exercises, so it rots unseen.

**Recurrence (PLAN-009):** adding a top-level `knowledge/` directory would have aborted the
nextjs scaffold — `create-next-app` refuses to run when the cwd holds anything outside its
allowlist, and `/infra-setup` parks harness dirs to a temp dir first. The new directory was not in
that park list. No component test touches that path: it exists only on a first run.

## The rule
Treat the new-user first-run as a gate: infra-setup creates a working `.env`; document the one-time
Actions enable. A tool that only works once you've configured it hasn't onboarded anyone.
