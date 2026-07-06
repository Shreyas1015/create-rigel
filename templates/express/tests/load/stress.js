/**
 * k6 STRESS test — find the breaking point. Run before a release / capacity planning.
 * Ramps virtual users up to 100 and holds, then ramps down.
 *
 *   k6 run --env BASE_URL=https://staging.example.com --env AUTH_TOKEN=xyz tests/load/stress.js
 *
 * Runs out of the box against /health. Copy the commented block for real endpoints.
 *
 * Thresholds: P95 < 1000ms, P99 < 2000ms, error rate < 5%.
 */
import http from 'k6/http'
import { check, sleep } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''

export const options = {
  stages: [
    { duration: '1m', target: 25 }, // warm up
    { duration: '2m', target: 50 }, // ramp to moderate load
    { duration: '2m', target: 100 }, // ramp to peak
    { duration: '3m', target: 100 }, // hold at peak
    { duration: '1m', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
  },
}

export default function () {
  const health = http.get(`${BASE_URL}/health`)
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: < 1000ms': (r) => r.timings.duration < 1000,
  })

  // --- Authenticated feature path (copy & adapt per feature) ---
  // const headers = { Authorization: `Bearer ${AUTH_TOKEN}`, 'Content-Type': 'application/json' }
  // const list = http.get(`${BASE_URL}/api/v1/applications`, { headers })
  // check(list, { 'list: status 200': (r) => r.status === 200 })

  sleep(1)
}
