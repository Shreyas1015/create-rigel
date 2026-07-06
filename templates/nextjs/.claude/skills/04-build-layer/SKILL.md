# /build-layer — Build Next Layer from Active Plan

Triggered by: `/build-layer` (no argument)

---

## Step 1 — Find Active Plan and Next Layer
```bash
PLAN=$(ls docs/exec-plans/active/*.md 2>/dev/null | head -1)
[[ -z "$PLAN" ]] && echo "No active plan. Run /write-plan first." && exit 1
cat "$PLAN"
```
Find first `[ ]` row. If all `[x]` → run `/garbage-collect`.

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

**If FAIL:** auto-fix each ITEM, log what was fixed, re-run gate (max 3 attempts).
**If PASS:** tick checkbox in plan, write ADR if non-obvious decision.

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
git push origin main
```

---

## Step 8 — Report to Human
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
