---
id: LSN-0012
summary: "First-run environment gaps (no .env, Actions off) break new users even when every component passes."
status: DISTILLED
seen: 2
first_seen: PLAN-006
last_seen: PLAN-006
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

## The rule
Treat the new-user first-run as a gate: infra-setup creates a working `.env`; document the one-time
Actions enable. A tool that only works once you've configured it hasn't onboarded anyone.
