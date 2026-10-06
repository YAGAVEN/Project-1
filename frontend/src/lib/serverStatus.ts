import { useSyncExternalStore } from 'react'

/**
 * Tracks whether the free-tier backend is currently mid-cold-start, as
 * observed by the axios retry loop (api.ts). The waking overlay and the
 * outbox flusher both read from here, which keeps api.ts free of imports
 * from either (no import cycle).
 */
interface ServerStatus {
  waking: boolean
  wakingSince: number | null
}

let status: ServerStatus = { waking: false, wakingSince: null }
let wakingCount = 0
const statusListeners = new Set<() => void>()
const serverUpListeners = new Set<() => void>()

function emitStatus() {
  statusListeners.forEach((listener) => listener())
}

/** Refcounted — several requests can be mid-retry at the same time. */
export function beginWaking() {
  if (wakingCount++ === 0) {
    status = { waking: true, wakingSince: Date.now() }
    emitStatus()
  }
}

export function endWaking() {
  if (wakingCount > 0 && --wakingCount === 0) {
    status = { waking: false, wakingSince: null }
    emitStatus()
  }
}

/** Fires on every successful response — the outbox flusher's sync trigger. */
export function notifyServerUp() {
  serverUpListeners.forEach((listener) => listener())
}

export function subscribeServerUp(listener: () => void): () => void {
  serverUpListeners.add(listener)
  return () => {
    serverUpListeners.delete(listener)
  }
}

function subscribeStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

export function useServerWaking(): ServerStatus {
  return useSyncExternalStore(subscribeStatus, () => status)
}
