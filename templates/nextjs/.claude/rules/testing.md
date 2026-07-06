---
paths:
  - "tests/**/*.ts"
  - "tests/**/*.tsx"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
---

# Testing Rules — Auto-injected on test file edits

## Coverage Thresholds (enforced in CI)

| Layer | Threshold | What to test |
|---|---|---|
| `src/utils/` | **100%** | Every branch |
| `src/hooks/` | **80%** | Loading, success, error states; mutations |
| `src/features/` | **70%** | Render, user interaction, form submission |
| `src/components/` | **70%** | Render + accessibility |

## Utils Tests — Pure Functions, 100% Branches

```typescript
// tests/unit/utils/parse-error.test.ts
import { parseError } from '@/utils/parse-error.util'

describe('parseError', () => {
  it('extracts message from Error', () => {
    expect(parseError(new Error('boom'))).toBe('boom')
  })
  it('passes through string errors', () => {
    expect(parseError('nope')).toBe('nope')
  })
  it('falls back for unknown shapes', () => {
    expect(parseError({ weird: true })).toBe('Something went wrong')
    expect(parseError(null)).toBe('Something went wrong')
  })
})
```

## Vitest + RTL — Hook Tests with MSW

```typescript
// tests/unit/hooks/use-applications.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'  // MSW server
import { createWrapper } from '../utils/create-wrapper'  // QueryClient wrapper
import { useApplications } from '@/hooks/use-applications'

describe('useApplications', () => {
  it('returns applications on success', async () => {
    server.use(
      http.get('/api/v1/applications', () =>
        HttpResponse.json({ items: [{ id: '1', stage: 'APPLIED', company: 'Acme' }], has_more: false })
      )
    )
    const { result } = renderHook(() => useApplications(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.items).toHaveLength(1)
  })

  it('returns error on failure', async () => {
    server.use(
      http.get('/api/v1/applications', () => HttpResponse.error())
    )
    const { result } = renderHook(() => useApplications(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

## Component Tests — Test Behaviour, Not Implementation
```typescript
// tests/unit/features/ApplicationCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplicationCard } from '@/features/applications/ApplicationCard'

describe('ApplicationCard', () => {
  it('displays company and role', () => {
    render(<ApplicationCard application={mockApplication} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Software Engineer')).toBeInTheDocument()
  })

  it('calls onDelete when delete button clicked', async () => {
    const onDelete = vi.fn()
    render(<ApplicationCard application={mockApplication} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith(mockApplication.id)
  })

  it('is accessible — delete button has aria-label', () => {
    render(<ApplicationCard application={mockApplication} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete application/i })).toBeInTheDocument()
  })
})
```

## Playwright — E2E Critical Paths
```typescript
// tests/e2e/applications.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Applications', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/applications')
  })

  test('can create a new application', async ({ page }) => {
    await page.getByRole('button', { name: 'New Application' }).click()
    await page.getByLabel('Company').fill('Acme Corp')
    await page.getByLabel('Role').fill('Software Engineer')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Acme Corp')).toBeVisible()
  })

  test('shows empty state when no applications', async ({ page }) => {
    // With MSW intercepting
    await expect(page.getByText(/no applications yet/i)).toBeVisible()
  })
})
```

## Cross-User Isolation — REQUIRED security test (one per resource)

The single most important security test: confirm User B cannot reach User A's resource,
and that the app reveals **404, not 403** (a 403 leaks that the resource exists).

```typescript
// tests/e2e/isolation.spec.ts
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'  // logs in + returns to a known URL

test('User B cannot access User A resource (404, not 403, not the data)', async ({ page }) => {
  // 1. User A creates a resource and we capture its id
  await loginAs(page, 'usera@example.com')
  await page.getByRole('button', { name: 'New Application' }).click()
  await page.getByLabel('Company').fill('Acme Corp')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).toHaveURL(/\/applications\/(?<id>[\w-]+)$/)
  const url = page.url()

  // 2. User B logs in and visits A's resource URL directly
  await loginAs(page, 'userb@example.com')
  const res = await page.goto(url)

  // 3. Must be denied as not-found — never expose A's data, never a bare 403
  expect(res?.status()).toBe(404)
  await expect(page.getByText('Acme Corp')).toHaveCount(0)
  await expect(page.getByText(/not found/i)).toBeVisible()
})
```

Add one of these per user-owned resource type. The backend enforces isolation via
`userId in WHERE`; this test proves the frontend surfaces it correctly.

## Visual Regression (Playwright Snapshots)
```typescript
test('application card snapshot', async ({ page }) => {
  await page.goto('/applications')
  await page.waitForSelector('[data-testid="application-card"]')
  await expect(page.locator('[data-testid="application-card"]').first())
    .toHaveScreenshot('application-card.png')
})
```

## MSW Setup (required)
```typescript
// tests/mocks/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'
export const server = setupServer(...handlers)

// tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'
export const handlers = [
  http.get('/api/v1/applications', () =>
    HttpResponse.json({ items: [], has_more: false, next_cursor_id: null })
  ),
  // Add per-test overrides via server.use() in individual tests
]
```
