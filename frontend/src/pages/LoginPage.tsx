import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * frontend.md §4 — email + password via Supabase Auth; the API never sees a password.
 * v1 shipped sign-in only; sign-up was added later (same page, toggle) — a new
 * user is auto-provisioned by the backend on their first API request.
 */
export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setSubmitting(false)
      if (error) {
        setError(error.message)
        return
      }
      if (!data.session) {
        // email confirmation is enabled on the project — no session until confirmed
        setNotice('Account created. Check your email to confirm, then sign in.')
        return
      }
      // auto-confirm project: session is live, AuthContext flips and redirects
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
    }
  }

  function switchMode() {
    setMode(mode === 'signin' ? 'signup' : 'signin')
    setError(null)
    setNotice(null)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Finance Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'signin' ? 'Sign in to see where your money goes.' : 'Create an account to start tracking.'}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            {mode === 'signup' && (
              <p className="mt-1 text-xs text-slate-400">At least 6 characters.</p>
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800" role="status">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={switchMode}
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-800"
        >
          {mode === 'signin'
            ? 'New here? Create an account'
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
