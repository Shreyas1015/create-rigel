# /load-test — k6 Performance Testing

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** k6 0.54  
**Source:** [k6 documentation](https://k6.io/docs/)

Triggered by: `/load-test [smoke|stress|soak]`

## Smoke (CI default)
```bash
k6 run --env BASE_URL=${BASE_URL:-http://localhost:8000} --env AUTH_TOKEN=${AUTH_TOKEN:-} tests/load/smoke.js
```
Thresholds: P95 < 500ms, error rate < 1%

## Stress (pre-release)
```bash
k6 run --env BASE_URL=$STAGING_URL tests/load/stress.js
```
Thresholds: P95 < 1000ms, P99 < 2000ms, errors < 5%

## stress.js scaffold
```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // ramp up
    { duration: '5m', target: 50 },   // sustained load
    { duration: '2m', target: 100 },  // spike
    { duration: '5m', target: 100 },  // sustained spike
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
  },
}

export default function () {
  const BASE_URL = __ENV.BASE_URL
  const TOKEN    = __ENV.AUTH_TOKEN
  const headers  = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

  const health = http.get(`${BASE_URL}/v1/health`)
  check(health, { 'health 200': (r) => r.status === 200 })

  // Add feature-specific tests here (list, create, update operations)
  sleep(1)
}
```

## smoke.js scaffold
```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 10, duration: '30s',
  thresholds: { http_req_duration: ['p(95)<500'], http_req_failed: ['rate<0.01'] },
}

export default function () {
  const BASE_URL = __ENV.BASE_URL
  const TOKEN    = __ENV.AUTH_TOKEN
  const headers  = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }

  const health = http.get(`${BASE_URL}/v1/health`)
  check(health, { 'health 200': (r) => r.status === 200 })

  // Add feature-specific tests here
  sleep(1)
}
```

## Results format for PR
```
Load Test (smoke — 10 VUs, 30s):
  P95: {N}ms  ✅/❌
  Errors: {N}%  ✅/❌
```
