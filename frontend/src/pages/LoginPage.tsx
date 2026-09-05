import { useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendlyAuthError } from '../lib/authErrors'
import { BrandLogo } from '../components/BrandLogo'
import { cx, inputClass } from '../components/ui'

/**
 * frontend.md §4 — Groww-style login. Email + password via Supabase Auth; the
 * API never sees a password. One screen, four views: sign-in, sign-up,
 * forgot-password and its "check your inbox" state. Forgot-password emails
 * redirect to /reset-password, where the new password is actually set.
 *
 * UX rules applied here (2026-09-05 redesign):
 * - system status: spinner + disabled controls while a request is in flight
 * - error prevention: inline field validation before any network call
 * - recovery: plain-language messages, forgot-password one click from the field
 * - recognition: visible labels, autoComplete, show/hide password
 * - one primary action per view; everything else is a text link
 */

type View = 'signin' | 'signup' | 'forgot' | 'forgot-sent'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const errorInputClass =
  'border-rose-400 focus:border-rose-500 focus:ring-rose-100'

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1.5 text-xs text-rose-600">
      {message}
    </p>
  )
}

function Alert({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm',
        tone === 'error' && 'bg-rose-50 text-rose-700',
        tone === 'info' && 'bg-brand-50 text-brand-800',
      )}
    >
      {children}
    </div>
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

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  )
}

export function LoginPage() {
  const location = useLocation()

  // Deep links may ask for a view directly (e.g. an expired reset link sends
  // the user here with { view: 'forgot' } — recognition over recall).
  const [view, setView] = useState<View>(() => {
    const requested = (location.state as { view?: string } | null)?.view
    return requested === 'signup' || requested === 'forgot' ? requested : 'signin'
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [sentTo, setSentTo] = useState('')

  function switchView(next: View) {
    setView(next)
    setFormError(null)
    setNotice(null)
    setFieldErrors({})
    // keep the email across views — the user already typed it
    if (next === 'forgot') setPassword('')
    if (next === 'signin') setShowPassword(false)
  }

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {}
    if (!email.trim()) errors.email = 'Email is required.'
    else if (!EMAIL_RE.test(email.trim())) errors.email = 'That doesn’t look like a valid email.'
    if (view === 'signin' || view === 'signup') {
      if (!password) errors.password = 'Password is required.'
      else if (view === 'signup' && password.length < 6)
        errors.password = 'Password must be at least 6 characters.'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)
    if (!validate()) return

    const trimmed = email.trim()
    setSubmitting(true)
    try {
      if (view === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: trimmed, password })
        if (error) {
          setFormError(friendlyAuthError(error.message))
          return
        }
        if (!data.session) {
          // email confirmation is enabled on the project — no session until confirmed
          setNotice('Account created. Check your email to confirm, then sign in.')
        }
        // auto-confirm project: session is live, AuthContext flips and redirects
        return
      }

      if (view === 'forgot') {
        // Supabase answers 200 even for unknown emails, so this never reveals
        // whether an account exists — the sent view is safe to show either way.
        const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) {
          setFormError(friendlyAuthError(error.message))
          return
        }
        setSentTo(trimmed)
        setView('forgot-sent')
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password })
      if (error) {
        setFormError(friendlyAuthError(error.message))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      await supabase.auth.resetPasswordForEmail(sentTo, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
    } finally {
      setResending(false)
    }
  }

  const submittingLabel =
    view === 'signup' ? 'Creating account…' : view === 'forgot' ? 'Sending link…' : 'Logging in…'

  return (
    <div className="flex min-h-screen bg-white">
      {/* Form column */}
      <div className="flex w-full flex-col lg:w-[45%]">
        <header className="px-6 pt-7 sm:px-12 xl:px-24">
          <BrandLogo />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-12 xl:px-24">
          <div className="w-full max-w-sm">
            {view === 'forgot-sent' ? (
              <div>
                <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50">
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-brand-600" aria-hidden="true">
                    <path
                      d="m5 12.5 4.5 4.5L19 7.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                  Check your inbox
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  We sent a password reset link to{' '}
                  <span className="font-medium text-slate-700">{sentTo}</span>. It expires in 60
                  minutes.
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Didn’t get it? Check your spam folder, or resend the email.
                </p>
                <button
                  type="button"
                  onClick={() => void handleResend()}
                  disabled={resending}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {resending && <SpinnerLight />}
                  {resending ? 'Resending…' : 'Resend email'}
                </button>
                <p className="mt-4 text-center text-sm text-slate-500">
                  <button
                    type="button"
                    onClick={() => switchView('signin')}
                    className="font-semibold text-brand-700 hover:text-brand-800"
                  >
                    Back to log in
                  </button>
                </p>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {view === 'signin' && 'Welcome back'}
                  {view === 'signup' && 'Create your account'}
                  {view === 'forgot' && 'Forgot password?'}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  {view === 'signin' && 'Log in to see where your money goes.'}
                  {view === 'signup' && 'Start tracking in under a minute.'}
                  {view === 'forgot' && 'Enter your email and we’ll send you a reset link.'}
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        if (fieldErrors.email) {
                          setFieldErrors(({ email: _drop, ...rest }) => rest)
                        }
                      }}
                      aria-invalid={fieldErrors.email ? true : undefined}
                      aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                      className={cx(inputClass, 'mt-1.5', fieldErrors.email && errorInputClass)}
                    />
                    <FieldError id="email-error" message={fieldErrors.email} />
                  </div>

                  {view !== 'forgot' && (
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="password"
                          className="block text-sm font-medium text-slate-700"
                        >
                          Password
                        </label>
                        {view === 'signin' && (
                          <button
                            type="button"
                            onClick={() => switchView('forgot')}
                            className="text-sm font-medium text-brand-700 hover:text-brand-800"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative mt-1.5">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                          placeholder={view === 'signup' ? 'At least 6 characters' : '••••••••'}
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value)
                            if (fieldErrors.password) {
                              setFieldErrors(({ password: _drop, ...rest }) => rest)
                            }
                          }}
                          aria-invalid={fieldErrors.password ? true : undefined}
                          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                          className={cx(
                            inputClass,
                            'pr-11',
                            fieldErrors.password && errorInputClass,
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-slate-600"
                        >
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                      <FieldError id="password-error" message={fieldErrors.password} />
                    </div>
                  )}

                  {formError && <Alert tone="error">{formError}</Alert>}
                  {notice && <Alert tone="info">{notice}</Alert>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && <Spinner />}
                    {submitting ? submittingLabel : view === 'signup' ? 'Create account' : view === 'forgot' ? 'Send reset link' : 'Log in'}
                  </button>
                </form>

                <p className="mt-8 text-center text-sm text-slate-500">
                  {view === 'signin' ? (
                    <>
                      New to Finance Tracker?{' '}
                      <button
                        type="button"
                        onClick={() => switchView('signup')}
                        className="font-semibold text-brand-700 hover:text-brand-800"
                      >
                        Create an account
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchView('signin')}
                      className="font-semibold text-brand-700 hover:text-brand-800"
                    >
                      ← Back to log in
                    </button>
                  )}
                </p>
              </>
            )}
          </div>
        </main>

        <footer className="px-6 pb-6 text-xs text-slate-400 sm:px-12 xl:px-24">
          By continuing, you agree to Finance Tracker’s Terms of Use and Privacy Policy.
        </footer>
      </div>

      <BrandPanel />
    </div>
  )
}

function SpinnerLight() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
      aria-hidden="true"
    />
  )
}

/** Decorative right column — Groww-style brand panel with a mock dashboard. */
function BrandPanel() {
  return (
    <div
      className="relative hidden flex-1 flex-col justify-center overflow-hidden bg-brand-50 p-14 lg:flex"
      aria-hidden="true"
    >
      <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-brand-100/70" />
      <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-brand-100/50" />

      <div className="relative mx-auto w-full max-w-md">
        <h2 className="text-3xl font-bold leading-tight tracking-tight text-slate-900">
          Track. Budget. <span className="text-brand-600">Grow.</span>
        </h2>
        <p className="mt-3 text-base text-slate-600">
          Every rupee, account and goal — in one calm place.
        </p>

        <div className="mt-10 rounded-3xl border border-brand-100 bg-white p-6 shadow-xl shadow-brand-100/60">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Net position
          </div>
          <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
            ₹8,42,300
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M4 17.5 9 11l4 3 7-9"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            12.4% this month
          </div>
          <svg viewBox="0 0 300 80" className="mt-4 h-20 w-full" preserveAspectRatio="none">
            <path
              d="M0 64 30 56 60 60 90 44 120 50 150 34 180 40 210 26 240 32 270 14 300 20 300 80 0 80 Z"
              fill="#cdeadd"
              opacity="0.7"
            />
            <path
              d="M0 64 30 56 60 60 90 44 120 50 150 34 180 40 210 26 240 32 270 14 300 20"
              fill="none"
              stroke="#00b386"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="mx-6 -mt-4 rounded-2xl border border-brand-100 bg-white p-4 shadow-lg shadow-brand-100/50">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Monthly budget</span>
            <span className="tabular-nums text-slate-500">₹18,400 of ₹25,000</span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-[74%] rounded-full bg-brand-500" />
          </div>
        </div>

        <ul className="mt-10 space-y-3.5">
          {[
            'Every account in one place',
            'Budgets that keep you honest',
            'Loans, goals and analytics',
          ].map((line) => (
            <li key={line} className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden="true">
                  <path
                    d="m5 12.5 4.5 4.5L19 7.5"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
