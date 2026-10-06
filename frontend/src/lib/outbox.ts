import { useEffect, useSyncExternalStore } from 'react'
import { api } from './api'
import { queryClient } from './queryClient'
import { subscribeServerUp } from './serverStatus'
import type { OutboxEntry } from './types'

/**
 * Offline outbox for quick transaction adds (cold-start resilience): when a
 * POST fails because the free-tier backend is asleep, the body is stored here
 * per user (`ft-pending-txns:<uid>`) and shown in the UI as a pending row;
 * useOutboxFlusher POSTs entries one-by-one as soon as the server answers,
 * deleting each from storage the moment the DB confirms it.
 */

const FLUSH_INTERVAL_MS = 20_000

let activeUid: string | null = null

/** Called by useOutboxFlusher — queue keys are per Supabase user. */
export function setOutboxUser(uid: string | null) {
  activeUid = uid
  hydrated = false
  queue = hydrate()
}

let queue: OutboxEntry[] = []
let hydrated = false

function hydrate(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(`ft-pending-txns:${activeUid ?? 'anon'}`)
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : []
  } catch {
    return []
  }
}

// Tiny external store: the queue array identity only changes on mutation, so
// useSyncExternalStore subscribers re-render exactly when the queue changes.
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(`ft-pending-txns:${activeUid ?? 'anon'}`, JSON.stringify(queue))
  } catch {
    /* storage full/blocked — the in-memory queue still syncs this session */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePendingTransactions(): OutboxEntry[] {
  return useSyncExternalStore(subscribe, () => queue)
}

export function enqueueTransaction(clientId: string, entry: OutboxEntry['body']) {
  if (!hydrated) queue = hydrate()
  hydrated = true
  queue = [...queue, { clientId, body: entry, queuedAt: new Date().toISOString() }]
  persist()
}

export function updateQueuedTransaction(clientId: string, body: OutboxEntry['body']) {
  if (!hydrated) queue = hydrate()
  hydrated = true
  queue = queue.map((item) => (item.clientId === clientId ? { ...item, body } : item))
  persist()
}

export function removeQueuedTransaction(clientId: string) {
  if (!hydrated) queue = hydrate()
  hydrated = true
  queue = queue.filter((item) => item.clientId !== clientId)
  persist()
}

let flushing = false

/**
 * Syncs queued entries oldest-first. A network failure means the server is
 * still asleep and the loop stops (the entry retries on the next trigger);
 * a 4xx means the entry conflicts with server state — it also stays queued
 * rather than being silently dropped, and shows its pending badge.
 */
export async function flushOutbox() {
  if (flushing || !activeUid) return
  if (!hydrated) queue = hydrate()
  hydrated = true
  if (queue.length === 0) return

  flushing = true
  let syncedAny = false
  try {
    while (queue.length > 0) {
      const entry = queue[0]
      try {
        await api.post('/transactions', entry.body)
      } catch {
        break
      }
      queue = queue.slice(1)
      persist()
      syncedAny = true
    }
  } finally {
    flushing = false
  }
  // Balances, budgets and goal progress are all derived — refresh everything,
  // matching the whole-cache invalidation the normal mutation path uses.
  if (syncedAny) void queryClient.invalidateQueries()
}

/** Flush triggers: mount, server-up, network regain, tab focus, and a timer. */
export function useOutboxFlusher(uid: string | null) {
  useEffect(() => {
    setOutboxUser(uid)
    return () => setOutboxUser(null)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    void flushOutbox()
    const onOnline = () => void flushOutbox()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flushOutbox()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const unsubscribeServerUp = subscribeServerUp(() => void flushOutbox())
    const interval = window.setInterval(() => void flushOutbox(), FLUSH_INTERVAL_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribeServerUp()
      window.clearInterval(interval)
    }
  }, [uid])
}
