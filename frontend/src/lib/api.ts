import axios, { isAxiosError, type AxiosInstance, type CreateAxiosDefaults, type InternalAxiosRequestConfig } from 'axios'
import { beginWaking, endWaking, notifyServerUp } from './serverStatus'

/**
 * The single Spring API client (backend.md §2.1): the frontend never touches
 * the database — every call goes through here with the Supabase JWT attached.
 */

/** Default token source. Dynamic import keeps this module (and its tests) free of env requirements. */
async function supabaseToken(): Promise<string | undefined> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

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

/** Marks a config that has already entered the retry loop (audit D-A1). */
type RetryMarker = { __ftRetried?: boolean }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface ClientOptions {
  /** Token source override (tests). Defaults to the Supabase session. */
  getToken?: () => Promise<string | undefined>
  /** Test seam: retry pacing, custom adapter, baseURL overrides. */
  axiosConfig?: CreateAxiosDefaults
  retryDelayMs?: number
  /** Test seam: overall retry budget (production default: 150s for cold starts). */
  retryDeadlineMs?: number
}

export function createApiClient(options: ClientOptions = {}): AxiosInstance {
  const getToken = options.getToken ?? supabaseToken
  const baseDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS
  const deadlineMs = options.retryDeadlineMs ?? RETRY_DEADLINE_MS

  const client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api/v1',
    // The free-tier backend can take ~a minute to wake from a cold start; each
    // attempt is capped so the retry loop below can pace the wait.
    timeout: 20_000,
    ...options.axiosConfig,
  })

  client.interceptors.request.use(async (config) => {
    const token = await getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  // A 401 from the API means the token is invalid beyond repair — end the
  // session so the auth guard routes back to login (Phase 4.3 adds a
  // refresh-and-replay attempt before this). Automatic retries below are
  // GET-only (audit D-A2): a POST/DELETE that committed but lost its response
  // must never be blind-retried — that creates duplicate financial records.
  // Writes either surface the error or fall back to the outbox, whose flush
  // is idempotent end-to-end (Idempotency-Key, audit H-3).
  client.interceptors.response.use(
    (response) => {
      notifyServerUp()
      return response
    },
    async (error) => {
      if (isAxiosError(error) && error.response?.status === 401) {
        const { supabase } = await import('./supabase')
        await supabase.auth.signOut()
        return Promise.reject(error)
      }

      const config = error.config as (InternalAxiosRequestConfig & RetryMarker) | undefined
      const method = config?.method?.toUpperCase()
      if (!config || method !== 'GET' || config.__ftRetried || !isRetryable(error)) {
        return Promise.reject(error)
      }
      // The marker lives ON the config: api.request(config) re-merges config
      // into a new object, so a WeakSet never matched the retried attempt and
      // every retry spawned its own nested retry loop (audit D-A1). String keys
      // survive the re-merge; symbols would not.
      config.__ftRetried = true

      beginWaking()
      const deadline = Date.now() + deadlineMs
      let delay = baseDelayMs
      let lastError: unknown = error
      try {
        while (Date.now() < deadline) {
          await sleep(delay)
          delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
          try {
            return await client.request(config)
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

  return client
}

export const api = createApiClient()
