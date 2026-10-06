import { QueryClient } from '@tanstack/react-query'

/**
 * App-wide React Query client. Retries are disabled here because the axios
 * layer (api.ts) owns cold-start retries for the free-tier backend — letting
 * both retry would multiply the wait. staleTime keeps focus refetches calm.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: false,
    },
  },
})
