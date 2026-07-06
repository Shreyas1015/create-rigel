---
name: 11-load-test
description: /load-test — k6 Performance Testing
verified: 2026-06-04
libraries: [k6]
source: https://grafana.com/docs/k6/latest/
staleness-threshold-days: 60
---

# /load-test — k6 Performance Testing

Triggered by: `/load-test [smoke|stress|soak]`
Default: `smoke`

**The scripts already ship in the template** at `tests/load/{smoke,stress,soak}.js`
and run out of the box against `/health` (no feature needed). npm scripts wrap them.
k6 is a separate binary — install it first: `choco install k6` (Windows) / `brew install k6` (macOS).

---

## Run it

```bash
# Local (server running on :3000)
npm run load:smoke
npm run load:stress
npm run load:soak

# Against a remote target (+ auth)
k6 run --env BASE_URL=https://staging.example.com --env AUTH_TOKEN=$TOKEN tests/load/smoke.js
```

## In CI (manual)

`.github/workflows/load-test.yml` runs **only** via `workflow_dispatch` — never on
push or PR. Trigger it from **GitHub → Actions → Load Test → Run workflow** and pass
`base_url`, `test` (smoke/stress/soak), and optional `auth_token`.

## Profiles & thresholds

| Profile | Load | Thresholds |
|---|---|---|
| Smoke  | 10 VUs / 30s | P95 < 500ms · err < 1% |
| Stress | ramp → 100 VUs | P95 < 1000ms · P99 < 2000ms · err < 5% |
| Soak   | 20 VUs, sustained (`--env DURATION=2h`) | P95 < 800ms · err < 2% |

---

## Adapting a script to a real endpoint

Each shipped script hits `/health` and includes a **commented** authenticated
example. Uncomment and point it at your feature:

```javascript
const headers = { Authorization: `Bearer ${__ENV.AUTH_TOKEN}`, 'Content-Type': 'application/json' }
const res = http.get(`${__ENV.BASE_URL}/api/v1/applications`, { headers })
check(res, {
  'status 200':     (r) => r.status === 200,
  'has data field': (r) => r.json('data') !== undefined,
})
```

## Interpreting Results
| Metric | Healthy | Investigate |
|---|---|---|
| P95 latency | < 500ms | > 500ms |
| P99 latency | < 1000ms | > 1000ms |
| Error rate | < 1% | > 1% |
| Checks passed | > 99% | < 99% |

## Attach Results to PR
```
Load Test Results (smoke — 10 VUs, 30s):
  P95: {N}ms  ✅/❌
  P99: {N}ms  ✅/❌
  Errors: {N}%  ✅/❌
```
