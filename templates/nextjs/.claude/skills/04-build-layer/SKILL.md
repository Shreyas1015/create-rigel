# /build-layer — Build Next Layer from Active Plan

Triggered by: `/build-layer` (no argument)

---

## Step 1 — Find Active Plan and Next Layer
```bash
PLAN=$(ls docs/exec-plans/active/*.md 2>/dev/null | head -1)
[[ -z "$PLAN" ]] && echo "No active plan. Run /write-plan first." && exit 1
cat "$PLAN"
```
Parse the **Layer Build Order** checklist in the plan. Find the first item still `- [ ]`
(unchecked) — this is the layer to build. If every item is `- [x]` → all layers complete, run
`/garbage-collect`.

---

## Step 2 — Check API Contract
```bash
ls src/types/api.generated.ts 2>/dev/null || echo "WARNING: api.generated.ts missing — run /api-sync"
```
If missing: stop and tell human to run `/api-sync` first.

---

## Step 3 — Load Context
Read: active plan, linked spec, `ARCHITECTURE.md`, path-scoped rule for this layer:
- Types → `.claude/rules/architecture.md`
- Lib → `.claude/rules/architecture.md` + `.claude/rules/security.md`
- Hooks → `.claude/rules/api-contract.md`
- Store → `.claude/rules/architecture.md`
- Features → `.claude/rules/components.md` + `.claude/rules/architecture.md`
- Components → `.claude/rules/components.md`
- App → `.claude/rules/architecture.md` + `.claude/rules/security.md`
- Tests → `.claude/rules/testing.md`

---

## Step 4 — Build the Layer

### Types (`src/types/domain.types.ts`)
- Add frontend-only types (form inputs, UI state, component props)
- NEVER duplicate what's in `api.generated.ts`
- Check: `import type { components } from '@/types/api.generated'` and use those

### Lib (`src/lib/`)
- New env vars: add to Zod schema in `env.ts` + `.env.example`
- New constants: add to `constants.ts`
- If api-client needs changes: add middleware — never change the base createClient call

### Hooks (`src/hooks/`)
- One file per domain: `use-{domain}.ts`
- Export `{domain}Keys` query key factory first
- Use `apiClient.GET/POST/PUT/PATCH/DELETE` — never raw `fetch()`
- Always `if (error) throw new Error(...)` after destructuring
- Include: list hook, single hook, create/update/delete mutations

### Store (`src/store/`)
- Only if feature needs client-only state (sidebar, modal, filters not in URL)
- `create<StoreType>()` with named slice
- NO server data — that's in TanStack Query

### Features (`src/features/{domain}/`)
Create these sub-files:
```
src/features/{domain}/
  index.ts               ← barrel export
  {Domain}List.tsx       ← list component
  {Domain}Card.tsx       ← single item
  {Domain}Form.tsx       ← create/edit form
  {Domain}Detail.tsx     ← detail view
  use-{domain}-page.ts  ← feature-level hooks (compose domain hooks)
```
Every component: Loading + Error + Empty states.
Forms: react-hook-form + zodResolver.
Every `use client`: has comment `// Client: [reason]`.
Every interactive element: aria-label, focus-visible.

### Components (`src/components/shared/`)
- New shared components needed by multiple features
- Props fully typed
- No hooks, no API calls — pure rendering

### App (`app/`)
- Page files: Server Components by default
- Import Feature component at top, render it
- NO `useState`, `useEffect`, `fetch` in page.tsx
- Layout changes: auth guard, breadcrumbs, nav items

### Tests
- `tests/unit/hooks/use-{domain}.test.ts` — MSW + renderHook
- `tests/unit/features/{Component}.test.tsx` — RTL + userEvent
- `tests/unit/utils/{util}.test.ts` — pure function tests
- `tests/e2e/{feature}.spec.ts` — Playwright happy path + auth

---

## Step 5 — Run Gate
Call `gate-checker` agent.

**If FAIL:** auto-fix each ITEM, log what was fixed, re-run gate (max 3 attempts), following the role-escalation rule below.
**If PASS:** tick the layer's box in the plan (`- [ ] Layer N` → `- [x] Layer N`), write ADR if non-obvious decision.

### Same failure twice → hand off to `/debug` (do NOT re-guess)

Before re-trying, compare this FAIL's **signature** to the previous attempt's (the gate-checker
records them to `.rigel/gate-failures.jsonl`). If the **same signature repeats**, the previous fix
was a guess and another guess is not a strategy — **run `/debug`**, which forces a stated
hypothesis, a minimal reproduction, and gate-verified confirmation before any further edit.

A *different* failure on the re-run is normal progress: keep going with the auto-fix loop below.

### Gate escalation — role routing (see `.claude/model-routing.json`)

Track the gate FAIL count for THIS layer across re-runs:

- **Attempts 1–2** (same layer): run each fix-and-re-gate cycle with a **worker**-role subagent (`sonnet`).
- **Attempt 3** (same layer — i.e. 2 worker attempts have already failed the gate): **escalate**. Run the fix-and-re-gate cycle with an **orchestrator**-role subagent (`opus`), then append **one** structured lesson record to `docs/exec-plans/lessons.log` (create the file if absent), verbatim in this shape:

  ```
  PLAN-<id> layer=<layer> escalated to orchestrator after 2 worker attempts failed gate
  ```

  One line per escalation, kept greppable — this is the episodic input a later memory phase consumes; do not reshape it.
- If the escalated (orchestrator) attempt still fails → stop and present the exact blocker to the human.

---

## Step 6 — ADR (if needed)
`docs/design-docs/decisions/ADR-XXX-{slug}.md`
Update `docs/design-docs/decisions/index.md`.

---

## Step 7 — Commit and Push
```bash
git add -A
git commit -m "{feat|chore|test}({scope}): {description}

{bullet points}

PLAN-XXX Layer N/Total"
git push origin "$(git branch --show-current)"   # the feature branch — never main (protected)
```

---

## Step 8 — Update `STATE.md` (the resume pointer)

Overwrite `STATE.md` so the next session can pick up cold — it is ephemeral and git-ignored, so
just rewrite it, never merge it:

- **Last session** (today), **Active plan**, **Last layer completed** (the one that just passed).
- **Next action**: the next unchecked layer, or `/garbage-collect` if all are `[x]`.
- **Open failures**: any signature in `.rigel/gate-failures.jsonl` still unresolved — one line each
  (`<signature> at <file:line> — what's blocked`). If a line has survived two sessions, say so and
  run `/debug`.

---

## Step 9 — Report to Human
```
═══════════════════════════════════════════
✅ Layer N ({layer-name}) — COMPLETE
═══════════════════════════════════════════
Files created: [list]
Gate attempts: N
Auto-fixed:    [list]
ADR written:   ADR-XXX / None needed
Committed:     [hash]

Progress: [x] Layer 1  [x] Layer 2  [ ] Layer 3 ...

Ready for Layer N+1: {next-layer-name}
Confirm to continue? [human must respond]
═══════════════════════════════════════════
```
**Wait for human confirmation before next layer.**
