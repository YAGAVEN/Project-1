import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/**
 * Last-resort error boundary (production readiness): a render error anywhere
 * in the tree shows a branded recovery screen instead of a blank white page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Hook point for a real reporter (Sentry, etc.) if this ever ships hosted.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 dark:bg-rose-500/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden="true">
              <path
                d="M12 8.5v5"
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
          <h1 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            The app hit an unexpected error. Reloading usually fixes it — your data is safe on
            the server.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
