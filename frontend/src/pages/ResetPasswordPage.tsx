import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../lib/authErrors'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
import { cx, inputClass } from '../components/ui'

/**
 * /reset-password — second half of the forgot-password flow (frontend.md §4).
 * The email link lands here with ?code=… (PKCE); supabase-js exchanges it in
 * the background and a recovery session appears, after which updateUser sets
 * the new password. We key off the pathname instead of the PASSWORD_RECOVERY
 * auth event — with PKCE that event fires unreliably (often only SIGNED_IN).
 *
 * Phases: verifying (code exchange in flight) → form (recovery session live)
 * → done, or invalid (expired / already-used / bogus link).
 */
type Phase = 'verifying' | 'form' | 'invalid' | 'done'

export function ResetPasswordPage() {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('error_description') || params.get('error')) return 'invalid'
    if (session) return 'form'
    return params.has('code') ? 'verifying' : 'invalid'
  })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Derived, not stored: the recovery link's code exchange finishing flips the
  // session on, and the form shows — no effect needed.
  const effectivePhase: Phase = session && phase === 'verifying' ? 'form' : phase

  // An exchange that silently fails (expired/already-used code) must not hang
  // forever — but once the session is live the timer is moot, so don't arm it.
  useEffect(() => {
    if (phase !== 'verifying' || session) return
    const timer = setTimeout(() => setPhase('invalid'), 8000)
    return () => clearTimeout(timer)
  }, [phase, session])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors: { password?: string; confirm?: string } = {}
    if (password.length < 6) errors.password = 'Password must be at least 6 characters.'
    if (confirmPassword !== password) errors.confirm = 'Passwords don’t match.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setFormError(friendlyAuthError(error.message))
        return
      }
      setPhase('done')
    } finally {
      setSubmitting(false)
    }
  }

  function requestNewLink() {
    navigate('/login', { state: { view: 'forgot' }, replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-white px-4 dark:bg-slate-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>

        {effectivePhase === 'verifying' && (
          <div className="mt-12 text-center" role="status" aria-live="polite">
            <span
              className="mx-auto block h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-500 dark:border-brand-500/30 dark:border-t-brand-400"
              aria-hidden="true"
            />
            <h1 className="mt-6 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Verifying your reset link…
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This only takes a moment.</p>
          </div>
        )}

        {effectivePhase === 'invalid' && (
          <div className="mt-12">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-50 dark:bg-amber-500/10">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden="true">
                <path
                  d="M12 8.5v4.5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <circle cx="12" cy="16.75" r="1.15" fill="currentColor" />
                <path
                  d="M10.3 3.9 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Link expired or already used
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Password reset links are single-use and expire after 60 minutes. Request a fresh
              one and you’ll be back in a minute.
            </p>
            <button
              type="button"
              onClick={requestNewLink}
              className="mt-6 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Request a new link
            </button>
            <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-200"
              >
                Back to log in
              </button>
            </p>
          </div>
        )}

        {effectivePhase === 'form' && (
          <>
            <h1 className="mt-12 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Set a new password
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Pick something you haven’t used before.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  New password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setFieldErrors(({ password: _drop, ...rest }) => rest)
                    }}
                    aria-invalid={fieldErrors.password ? true : undefined}
                    aria-describedby={fieldErrors.password ? 'new-password-error' : undefined}
                    className={cx(inputClass, 'pr-11', fieldErrors.password && errorInputClass)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <FieldError id="new-password-error" message={fieldErrors.password} />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Type it once more"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setFieldErrors(({ confirm: _drop, ...rest }) => rest)
                  }}
                  aria-invalid={fieldErrors.confirm ? true : undefined}
                  aria-describedby={fieldErrors.confirm ? 'confirm-password-error' : undefined}
                  className={cx(inputClass, 'mt-1.5', fieldErrors.confirm && errorInputClass)}
                />
                <FieldError id="confirm-password-error" message={fieldErrors.confirm} />
              </div>

              {formError && (
                <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                )}
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}

        {effectivePhase === 'done' && (
          <div className="mt-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 dark:bg-brand-500/10">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-brand-600 dark:text-brand-400" aria-hidden="true">
                <path
                  d="m5 12.5 4.5 4.5L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Password updated
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Your password has been changed. Use it the next time you log in.
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard', { replace: true })}
              className="mt-6 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Continue to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const errorInputClass =
  'border-rose-400 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-500/60 dark:focus:border-rose-400 dark:focus:ring-rose-500/20'

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
      {message}
    </p>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M2.5 12S6 5.75 12 5.75 21.5 12 21.5 12 18 18.25 12 18.25 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
      {!open && (
        <path d="m4.5 19.5 15-15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  )
}
