---
paths:
  - "src/features/**/*.tsx"
  - "src/components/**/*.tsx"
  - "app/**/*.tsx"
---

# Component Rules — Auto-injected on component file edits

## Every Component Checklist

### Loading, Error, and Empty States (ALL THREE required on data-fetching components)
```typescript
// ✅ All 3 states handled
export function ApplicationList() {
  const { data, isPending, isError, error } = useApplications()

  if (isPending) return <ApplicationListSkeleton />   // skeleton > spinner
  if (isError)   return <ErrorState message={error.message} retry={refetch} />
  if (!data?.items.length) return <EmptyState />

  return data.items.map(app => <ApplicationCard key={app.id} app={app} />)
}

// ❌ Missing states — silent failure
export function ApplicationList() {
  const { data } = useApplications()
  return data?.items.map(app => <ApplicationCard key={app.id} app={app} />)
  // undefined if loading? Error? No items? All render nothing silently.
}
```

### Forms — React Hook Form + Zod + shadcn/ui
```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'

const createApplicationSchema = z.object({
  company: z.string().min(1, 'Company is required'),
  role:    z.string().min(1, 'Role is required'),
  jobUrl:  z.string().url().optional(),
})
type CreateApplicationInput = z.infer<typeof createApplicationSchema>

export function CreateApplicationForm({ onSuccess }: { onSuccess: () => void }) {
  const form = useForm<CreateApplicationInput>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: { company: '', role: '' },
  })
  const { mutate, isPending } = useCreateApplication()

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(data => mutate(data, { onSuccess }))}>
        <FormField control={form.control} name="company" render={({ field }) => (
          <FormItem>
            <FormLabel>Company</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Creating...' : 'Create'}
        </Button>
      </form>
    </Form>
  )
}
```

### Images — Always next/image
```typescript
// ✅
import Image from 'next/image'
<Image src="/logo.png" alt="Logo" width={120} height={40} />

// ❌ Flagged by post-write hook + ESLint (next/core-web-vitals no-img-element)
<img src="/logo.png" alt="Logo" />
```

### Accessibility (every interactive element)
```typescript
// ✅
<button
  aria-label="Delete application"
  onClick={handleDelete}
  className="focus-visible:ring-2 focus-visible:ring-ring"
>
  <TrashIcon aria-hidden />
</button>

// ❌
<div onClick={handleDelete}>  {/* not focusable, no role */}
  <TrashIcon />
</div>
```

### Tailwind + shadcn/ui — Use cn() for conditional classes
```typescript
import { cn } from '@/utils/cn.util'

<div className={cn(
  'rounded-lg border p-4',
  isPending && 'opacity-50 pointer-events-none',
  isError && 'border-destructive',
)}>
```

### No Inline Event Handlers with Business Logic
```typescript
// ✅ Handler defined, logic delegated to mutation
const { mutate: deleteApp } = useDeleteApplication()
<Button onClick={() => deleteApp(app.id)}>Delete</Button>

// ❌ Inline logic
<Button onClick={async () => {
  await fetch(`/api/v1/applications/${app.id}`, { method: 'DELETE' })
  router.refresh()
}}>Delete</Button>
```
