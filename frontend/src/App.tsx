import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { router } from '@/routes/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--color-ink-card)',
            color: 'var(--color-court-cream)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: "'Hanken Grotesk', sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  )
}
