/**
 * k6 SMOKE test — minimal load, run on every change / before a release.
 * Goal: confirm the service is up and fast under light traffic.
 *
 *   k6 run tests/load/smoke.js
 *   k6 run --env BASE_URL=https://staging.example.com --env AUTH_TOKEN=xyz tests/load/smoke.js
 *
 * Runs out of the box against /health (no auth, exists after /infra-setup).
 * Copy the commented block to exercise a real authenticated endpoint per feature.
 *
 * Thresholds: P95 < 500ms, error rate < 1%.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

export default function () {
  // --- Liveness: always available, no auth ---
  const health = http.get(`${BASE_URL}/health`)
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: ok=true': (r) => r.json('ok') === true,
    'health: < 500ms': (r) => r.timings.duration < 500,
  })

  // --- Authenticated feature path (copy & adapt per feature) ---
  // const headers = { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
  // const list = http.get(`${BASE_URL}/api/v1/applications`, { headers })
  // check(list, {
  //   'list: status 200': (r) => r.status === 200,
  //   'list: has data': (r) => r.json('data') !== undefined,
  // })

  sleep(1)
}
