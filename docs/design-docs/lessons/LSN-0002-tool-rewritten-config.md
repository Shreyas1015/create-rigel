---
id: LSN-0002
summary: "A tool that rewrites its own config file will silently erase config you put there — own the file."
status: ENFORCED
seen: 2
first_seen: PLAN-005
last_seen: PLAN-006
signatures: []
enforced_by: ".prettierignore (.rigel/) ; Rigel-owned severity file (ADR-002)"
---
## What went wrong
Prettier reformatted `.rigel/git-policy.json`'s single-line protection objects, breaking the
single-line shell readers (DF-15). Impeccable rewrites `.impeccable/config.json` on `impeccable
ignores`, so Rigel severity config placed there was silently erased, demoting slop blockers to
nothing with no visible breakage (ADR-002).

## Why it happens
A formatter or tool that *owns* a file overwrites anything you add to it — and does so without an
error, so the loss is invisible until something downstream quietly misbehaves.

## The rule
Put your config in a file the tool never rewrites; ignore tool-owned files from your formatter.
See [[third-party-config-ownership]].
