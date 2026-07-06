# /perf-budget — Performance Budget Check

> **Verified:** 2026-06-05 · **Staleness threshold:** 60 days
> **Sources:** Next.js bundle analyzer (https://nextjs.org/docs/app/guides/package-bundling) ·
> Core Web Vitals (https://web.dev/vitals)
> If older than the threshold, fetch current docs via `ctx7` (wired in `.mcp.json`), or
> `WebFetch`/`WebSearch` if ctx7 is unavailable, before running — `next build` output
> format and CWV thresholds shift between releases.

Triggered by: /perf-budget

## Step 1 — Bundle Analysis
```bash
ANALYZE=true npm run build 2>&1 | grep -E "Page|First Load JS|kB"
```
Flag any route with First Load JS > 150kB.

## Step 2 — Client Component Audit
```bash
grep -rn "^'use client'" src/ app/ --include="*.tsx" -l
```
For each file: verify it actually needs useState/useEffect/browser APIs.

## Step 3 — Image Check
```bash
grep -rn "<img " src/ app/ --include="*.tsx"
grep -rn "<Image " src/ app/ --include="*.tsx" | grep -v "width\|fill"
```

## Step 4 — Build Time
```bash
time npm run build 2>&1 | tail -5
```

## Report
```
PERF BUDGET — {timestamp}

Bundle:
  [route]: [size]kB  PASS/FAIL (target < 150kB)

Client components: N total
  Unnecessary (review): [files]

Images using raw <img>: N (should be 0)
Images missing dimensions: N

Build time: Xs

OVERALL: PASS / N issues
```
