import { useEffect, useState } from 'react'
import { useServerWaking } from '../lib/serverStatus'
import { BrandLogo } from './BrandLogo'

const HINTS = [
  'Free-tier servers sleep when idle — waking yours up.',
  'This usually takes under a minute.',
  'Almost there — thanks for hanging tight.',
]

/** Full-screen cover while the axios retry loop waits out a cold start. */
export function ServerWakingOverlay() {
  const { waking, wakingSince } = useServerWaking()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!waking || wakingSince === null) return
    const secondsSince = () => Math.max(0, Math.round((Date.now() - wakingSince) / 1000))
    const immediate = window.setTimeout(() => setElapsed(secondsSince()), 0)
    const timer = window.setInterval(() => setElapsed(secondsSince()), 1000)
    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(timer)
    }
  }, [waking, wakingSince])

  if (!waking) return null

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-50/85 backdrop-blur-sm dark:bg-slate-950/85"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <span className="h-14 w-14 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-800 dark:border-t-brand-400" />
        <BrandLogo />
        <div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Waking up the server…</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {elapsed > 0 ? `${elapsed}s · ` : ''}
            {HINTS[Math.min(Math.floor(elapsed / 20), HINTS.length - 1)]}
          </p>
        </div>
      </div>
    </div>
  )
}
