import { cx } from './ui'

/** Shared brand mark — login page (§4) and the app sidebar (§3) use the same one. */
export function BrandLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const large = size === 'lg'
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cx(
          'grid place-items-center rounded-xl bg-brand-500 text-white',
          large ? 'h-11 w-11' : 'h-8 w-8',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={large ? 'h-6 w-6' : 'h-4.5 w-4.5'}
          aria-hidden="true"
        >
          <path
            d="M4 17.5 9 11l4 3 7-9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.5 5H20v5.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={cx('font-bold tracking-tight text-slate-900', large ? 'text-2xl' : 'text-lg')}>
        Finance<span className="text-brand-600">Tracker</span>
      </span>
    </span>
  )
}
