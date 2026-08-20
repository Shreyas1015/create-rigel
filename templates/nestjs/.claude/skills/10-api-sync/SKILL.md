# /api-sync — Export Live OpenAPI Spec

NestJS generates OpenAPI automatically from `@ApiProperty` decorators. No static file is
hand-written — the spec is exported from the decorators.

## Export

```bash
npm run openapi:export      # → ./openapi.json  (scripts/openapi.export.ts)
```

This runs the app in NestJS **preview mode**: the module graph is built but no provider is
instantiated, so the export needs no Postgres, no Redis, and no running server. That is what
lets `npm run gate` verify the contract on a laptop with nothing booted.

Alternative, only if preview mode can't build your graph — boot the app and pull the live doc:

```bash
curl http://localhost:3000/api/docs-json -o openapi.json
```

Prefer fixing the module: the freshness half of the contract gate re-runs `openapi:export`, so an
export that requires a running server makes the gate require one too.

## Commit

```bash
npm run contract:gate       # freshness + breaking-change + exemption-expiry checks
git add openapi.json
git commit -m "chore(api): export openapi spec"
git push origin main
```

The frontend can now run `/api-sync` from its project using this file.

## The contract gate (PLAN-010)

`npm run gate` runs `contract:gate`, which enforces three things, in this order:

1. **FRESHNESS** — re-export and compare. If the committed `openapi.json` drifted, the gate fails
   first and loudest: a stale spec makes `/api-sync`, the service map, and every check below it a
   lie. Fix: `npm run openapi:export` and commit the result.
2. **BREAKING** — `oasdiff breaking --fail-on ERR origin/main:openapi.json openapi.json`. Removing
   an endpoint, removing a required response property, adding a required request parameter, or
   changing a property type all fail here. Git history is the contract registry — there is no
   broker and no cross-repo CI to stand up. Removing an *optional* property is a WARN: it does not
   block, but it is printed, because a consumer may still care.
3. **EXEMPTIONS** — every `.oasdiff-ignore` line needs a `# reason:` and a `# expires:`, and an
   **expired** entry fails. A "temporary" exemption cannot quietly become permanent.

To ship a breaking change deliberately, in order of preference:

1. `x-stability-level: draft` on the endpoint — it's still moving, so it's exempt.
2. `deprecated: true` + `x-sunset: <date>` — expand, migrate, then contract after the date.
3. A line in `.oasdiff-ignore` with `# reason:` and `# expires:` — break glass; it self-destructs.

Never a PR label. A skipped required check is a silently disabled gate.

If `oasdiff` is not installed the breaking-change step is skipped with a notice (freshness and
exemption checks still run). Install it: `brew install oasdiff`.

## Rules

- Never hand-edit `openapi.json` — it is generated; edit the decorators.
- Re-export and commit in the SAME commit as the controller/DTO change, or the gate fails.
