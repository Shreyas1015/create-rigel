// Lighthouse CI config — consumed by `lhci autorun --config=lighthouserc.js`
// (see .github/workflows/lighthouse.yml and the perf-auditor agent).
// Thresholds mirror the Core Web Vitals targets in .claude/agents/perf-auditor.md.
module.exports = {
  ci: {
    collect: {
      // lhci builds nothing — the workflow runs `next build` first, then lhci
      // starts the production server and waits for it.
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      // Add your critical routes here as the app grows (e.g. '/login', '/applications').
      // Public routes only — authed routes redirect to /login and skew the budget.
      url: ['http://localhost:3000/'],
      numberOfRuns: 3,
      settings: { preset: 'desktop' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // TBT is noisy on shared CI runners → warn, not error.
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        // Bundle-size budget — the enforceable form of the "150kB First Load JS"
        // target the perf docs cite. Script transfer size (gzipped) for the page.
        'resource-summary:script:size': ['error', { maxNumericValue: 175000 }],
        'total-byte-weight': ['warn', { maxNumericValue: 1600000 }],
      },
    },
    upload: {
      // No secrets required — uploads a shareable report to LHCI temp storage.
      target: 'temporary-public-storage',
    },
  },
}
