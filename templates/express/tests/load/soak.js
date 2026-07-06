/**
 * k6 SOAK test — sustained moderate load over a long window. Catches memory
 * leaks, connection-pool exhaustion, and slow degradation.
 *
 *   k6 run --env BASE_URL=https://staging.example.com tests/load/soak.js
 *   k6 run --env DURATION=2h --env BASE_URL=... tests/load/soak.js
 *
 * Default duration is 30m (override with --env DURATION). Runs out of the box
 * against /health. Copy the commented block for real endpoints.
 *
 * Thresholds: P95 < 800ms, error rate < 2% — must hold steady for the whole run.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const DURATION = __ENV.DURATION || '30m'

export const options = {
  stages: [
    { duration: '2m', target: 20 }, // ramp to moderate load
    { duration: DURATION, target: 20 }, // hold steady (the soak)
    { duration: '2m', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.02'],
  },
}

export default function () {
  const health = http.get(`${BASE_URL}/health`)
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: ok=true': (r) => r.json('ok') === true,
  })

  // --- Authenticated feature path (copy & adapt per feature) ---
  // const headers = { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
  // const list = http.get(`${BASE_URL}/api/v1/applications`, { headers })
  // check(list, { 'list: status 200': (r) => r.status === 200 })

  sleep(1)
}
