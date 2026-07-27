---
id: LSN-0008
summary: "Generated/build artifacts belong in .gitignore — never the repo, never the published package."
status: ENFORCED
seen: 2
first_seen: PLAN-006
last_seen: PLAN-007
signatures: []
enforced_by: "templates' gitignore (*.tsbuildinfo, next-env.d.ts, __pycache__) + repo .gitignore (__pycache__, *.py[cod]) + scripts/check-package-contents.mjs (CI, tamper-tested)"
---

## What went wrong

A scaffolded build committed `tsconfig.tsbuildinfo` and `next-env.d.ts` (DF-14) — machine-generated
files that churn and leak into diffs.

**Recurrence (PLAN-007, v0.8.0):** `templates/fastapi/scripts/__pycache__/*.pyc` — Python bytecode
created by a local `py_compile` verification — was committed and **shipped to npm in v0.8.0**. The
repo's own `.gitignore` had no Python coverage. Scaffolded projects were unaffected (the shipped
`gitignore` already ignores `__pycache__`), but every consumer downloaded the artifact. Every
component check passed; only inspecting the real packed tarball caught it — see [[LSN-0003]].

## Why it happens

Toolchains emit build artifacts into the working tree as a side effect of *verifying* things. If
they aren't ignored, the next `git add -A` captures them silently — and a repo that scaffolds other
repos has two distinct hygiene boundaries (the template's ignore file, and its own) that are easy
to conflate.

## The rule

Every generated artifact is ignored at **both** boundaries: the template it ships from *and* the
repo that ships it. If a tool writes it, git must not track it and npm must not publish it.
Enforced mechanically at the package boundary — `check-package-contents.mjs` asserts the real
`npm pack` file list carries no bytecode, build output, coverage, `node_modules`, or `.env`.
