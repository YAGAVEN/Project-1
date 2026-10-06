import { useEffect, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useAuth } from '../auth/AuthContext'

const CACHE_BUSTER = 'v1'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Rehydrates the React Query cache from localStorage so pages render
 * instantly from last-known data while the free-tier backend wakes up.
 * Keyed per Supabase user — a shared device never leaks data across
 * accounts, and signing out wipes whatever is still in memory.
 */
export function PersistGate({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const client = useQueryClient()
  const uid = session?.user.id ?? null

  useEffect(() => {
    if (!uid) client.clear()
  }, [uid, client])

  const persister = useMemo(
    () =>
      uid
        ? createSyncStoragePersister({ key: `ft-query-cache:${uid}`, storage: window.localStorage })
        : null,
    [uid],
  )

  if (!uid || !persister) return <>{children}</>

  return (
    <PersistQueryClientProvider
      key={uid}
      client={client}
      persistOptions={{ persister, buster: CACHE_BUSTER, maxAge: MAX_AGE_MS }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
