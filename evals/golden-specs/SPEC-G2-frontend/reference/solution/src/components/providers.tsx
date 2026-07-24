'use client' // Client: holds the TanStack Query context (React state) the server layout can't.

// src/components/providers.tsx
// App-wide client context that the generated root layout (a Server Component) cannot hold:
// the TanStack Query client + devtools and the toast portal. Wrapped around {children} in
// app/layout.tsx.
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  // One client per app instance — created lazily so it survives re-renders but is never
  // shared across requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
