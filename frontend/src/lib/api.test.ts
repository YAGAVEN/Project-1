import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './api'

// Phase 2 audit fix (D-A1/D-A2): automatic retries must be GET-only, must
// never touch non-idempotent financial writes, and must never nest (the old
// WeakSet guard never matched retried attempts because axios re-merges the
// config on api.request(config)). A scripted adapter records every attempt
// the client actually makes.

type Step = { status?: number }

function scriptedAdapter(script: Step[]) {
  let call = 0
  const seenAuthHeaders: unknown[] = []
  const adapter: AxiosAdapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
    seenAuthHeaders.push(config.headers?.Authorization)
    const step = script[Math.min(call, script.length - 1)]
    call += 1
    const response: AxiosResponse = {
      data: { attempt: call },
      status: step.status ?? 200,
      statusText: String(step.status ?? 200),
      headers: {},
      config,
    }
    if (step.status === undefined) {
      // No response at all — the "server unreachable" shape (cold start).
      const error = new Error(`network failure on attempt ${call}`)
      Object.assign(error, { config, code: 'ECONNABORTED', isAxiosError: true })
      throw error
    }
    if (step.status >= 400) {
      const error = new Error(`http ${step.status}`)
      Object.assign(error, { config, response, isAxiosError: true })
      throw error
    }
    return response
  })
  return {
    adapter,
    callCount: () => call,
    seenAuthHeaders,
  }
}

const testClient = (script: Step[], extra: { retryDelayMs?: number; retryDeadlineMs?: number } = {}) => {
  const { adapter, callCount, seenAuthHeaders } = scriptedAdapter(script)
  const client = createApiClient({
    getToken: async () => 'test-token',
    axiosConfig: { baseURL: 'http://test.local/api/v1', timeout: 1000, adapter },
    retryDelayMs: 1,
    retryDeadlineMs: 40,
    ...extra,
  })
  return { client, callCount, seenAuthHeaders }
}

describe('createApiClient retry policy', () => {
  it('retries a GET through transient server errors until it succeeds', async () => {
    const { client, callCount } = testClient([{ status: 503 }, { status: 502 }, { status: 200 }])

    const response = await client.get('/accounts')

    expect(response.status).toBe(200)
    expect(callCount()).toBe(3)
  })

  it('attaches the bearer token from the token source on every attempt', async () => {
    const { client, seenAuthHeaders } = testClient([{ status: 503 }, { status: 200 }])

    await client.get('/accounts')

    expect(seenAuthHeaders).toEqual(['Bearer test-token', 'Bearer test-token'])
  })

  it('never retries a POST — even when the failure looks transient', async () => {
    const { client, callCount } = testClient([{ status: 503 }])

    await expect(client.post('/transactions', { amount: 100 }))
      .rejects.toMatchObject({ response: { status: 503 } })

    expect(callCount()).toBe(1)
  })

  it('never retries a DELETE', async () => {
    const { client, callCount } = testClient([{ status: 503 }])

    await expect(client.delete('/transactions/x'))
      .rejects.toMatchObject({ response: { status: 503 } })

    expect(callCount()).toBe(1)
  })

  it('does not retry 4xx responses — they will fail identically again', async () => {
    const { client, callCount } = testClient([{ status: 400 }])

    await expect(client.get('/accounts')).rejects.toMatchObject({ response: { status: 400 } })

    expect(callCount()).toBe(1)
  })

  it('retries a permanently failing GET only within ONE loop — never nests', async () => {
    // Single loop with 1ms base delay inside a 40ms budget makes a small,
    // linear attempt count. The nesting bug multiplied attempts exponentially
    // (every failed retry spawned its own full loop), which would blow far
    // past this bound within the same budget.
    const { client, callCount } = testClient([{ status: 503 }])

    await expect(client.get('/dashboard')).rejects.toBeTruthy()

    expect(callCount()).toBeGreaterThanOrEqual(2)
    expect(callCount()).toBeLessThanOrEqual(10)
  })
})
