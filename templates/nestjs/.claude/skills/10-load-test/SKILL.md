# /load-test [smoke|stress|soak]

```bash
k6 run --env BASE_URL=${BASE_URL:-http://localhost:3000} tests/load/smoke.js
```

Create tests/load/smoke.js:
```javascript
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 10, duration: '30s',
  thresholds: { http_req_duration: ['p(95)<500'], http_req_failed: ['rate<0.01'] },
}

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/health`)
  check(res, { 'health 200': (r) => r.status === 200 })
  sleep(1)
}
```

Results format for PR:
```
Load Test (smoke — 10 VUs, 30s):
  P95: {N}ms ✅/❌ (target < 500ms)
  Errors: {N}% ✅/❌ (target < 1%)
```
