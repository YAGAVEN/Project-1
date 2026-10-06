import axios from 'axios'
import { supabase } from './supabase'
import { beginWaking, endWaking, notifyServerUp } from './serverStatus'

/**
 * The single Spring API client (backend.md §2.1): the frontend never touches
 * the database — every call goes through here with the Supabase JWT attached.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  // The free-tier backend can take ~a minute to wake from a cold start; each
  // attempt is capped so the retry loop below can pace the wait.
  timeout: 20_000,
})

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Only infrastructure failures are worth retrying — a 400 will fail again. */
function isRetryable(error: unknown): error is { response?: { status?: number } } {
  if (typeof error !== 'object' || error === null || !('response' in error)) return true
  const status = (error as { response?: { status?: number } }).response?.status
  if (status === undefined) return true // no response at all — server unreachable
  return [502, 503, 504].includes(status)
}

const RETRY_DELAY_MS = 3_000
const MAX_RETRY_DELAY_MS = 10_000
// Render cold starts take ~a minute; give up long after that.
const RETRY_DEADLINE_MS = 150_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Configs already being paced by an outer retry loop skip this interceptor,
 * so retries never nest.
 */
const retriedConfigs = new WeakSet<object>()

// A 401 from the API means the token is invalid beyond repair — end the session
// so the auth guard routes back to login (supabase-js refreshes transparently
// while a valid refresh token exists). Everything else that looks like a
// sleeping server is retried with backoff while the waking overlay covers the
// wait; the outbox flusher syncs queued transactions as soon as one attempt
// lands.
api.interceptors.response.use(
  (response) => {
    notifyServerUp()
    return response
  },
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await supabase.auth.signOut()
      return Promise.reject(error)
    }

    const config = error.config
    if (!config || !isRetryable(error) || retriedConfigs.has(config)) {
      return Promise.reject(error)
    }
    retriedConfigs.add(config)

    beginWaking()
    const deadline = Date.now() + RETRY_DEADLINE_MS
    let delay = RETRY_DELAY_MS
    let lastError: unknown = error
    try {
      while (Date.now() < deadline) {
        await sleep(delay)
        delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
        try {
          return await api.request(config)
        } catch (retryError) {
          if (!isRetryable(retryError)) throw retryError
          lastError = retryError
        }
      }
    } finally {
      endWaking()
    }
    return Promise.reject(lastError)
  },
)
