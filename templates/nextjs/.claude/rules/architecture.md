---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "app/**/*.tsx"
  - "app/**/*.ts"
---

# Architecture Rules — Auto-injected on every src/ and app/ file edit

## Import Order Check — Before Writing Any Import

| Your file is in | You may import from |
|---|---|
| `src/types/` | Nothing (third-party ok: zod) |
| `src/lib/` | `src/types/` only |
| `src/hooks/` | `src/types/`, `src/lib/` |
| `src/store/` | `src/types/` only |
| `src/utils/` | Nothing (stdlib + third-party only) |
| `src/components/` | `src/types/`, `src/utils/` |
| `src/features/` | `src/types/`, `src/lib/`, `src/hooks/`, `src/store/`, `src/components/`, `src/utils/` |
| `app/` | `src/features/`, `src/components/` |

## api.generated.ts — THE CONTRACT
```typescript
// ✅ Import types FROM the generated file
import type { components, paths } from '@/types/api.generated'
type Application = components['schemas']['ApplicationResponse']

// ❌ NEVER manually write a type that mirrors the generated one
type Application = {   // if this matches api.generated.ts → DELETE IT
  id: string
  stage: string
  ...
}

// ❌ NEVER edit api.generated.ts
// Run /api-sync to regenerate it
```

## API Calls — Hooks Only
```typescript
// ✅ Feature uses a hook
import { useApplications } from '@/hooks/use-applications'

function ApplicationList() {
  const { data, isPending, error } = useApplications()
  if (isPending) return <Skeleton />
  if (error) return <ErrorState />
  return data?.items.map(app => <ApplicationCard key={app.id} app={app} />)
}

// ❌ Direct fetch in component — FORBIDDEN
function ApplicationList() {
  useEffect(() => {
    fetch('/api/v1/applications')  // WRONG
  }, [])
}
```

## Server vs Client Components
```typescript
// ✅ Server Component — default, no directive
export default async function ApplicationsPage() {
  return (
    <div>
      <ApplicationListClient />  {/* client boundary inside */}
    </div>
  )
}

// ✅ Client Component — with reason comment
'use client'  // Client: uses TanStack Query (useQuery)
export function ApplicationListClient() {
  const { data } = useApplications()
  ...
}

// ❌ 'use client' without comment
'use client'
export function SomeComponent() { ... }  // Why? What browser API?
```

## No Business Logic in App Pages
```typescript
// ✅ Page = layout + render feature
export default function ApplicationsPage() {
  return <ApplicationsFeature />
}

// ❌ Business logic in page — belongs in features/
export default function ApplicationsPage() {
  const [filtered, setFiltered] = useState([])
  const handleStageChange = async (id, stage) => {   // WRONG LAYER
    await fetch(`/api/v1/applications/${id}/stage`)
    ...
  }
}
```
