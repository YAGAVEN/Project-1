import { cx, inputClass } from './ui'
import { formatAnchor, shiftAnchor, todayISO } from '../lib/format'
import type { Period } from '../lib/queries'
import type { PeriodType } from '../lib/types'

const TYPES: PeriodType[] = ['DAY', 'WEEK', 'MONTH', 'YEAR']

/** frontend.md §6 — reusable Day/Week/Month/Year selector with prev/next arrows. */
export function PeriodSelector({
  value,
  onChange,
}: {
  value: Period
  onChange: (next: Period) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
        {TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange({ periodType: type, date: value.date })}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-medium capitalize',
              value.periodType === type ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
        <button
          type="button"
          aria-label="Previous period"
          onClick={() => onChange({ ...value, date: shiftAnchor(value.periodType, value.date, -1) })}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          ‹
        </button>
        <span className="min-w-36 px-2 text-center text-sm font-medium text-slate-700 tabular-nums">
          {formatAnchor(value.periodType, value.date)}
        </span>
        <button
          type="button"
          aria-label="Next period"
          onClick={() => onChange({ ...value, date: shiftAnchor(value.periodType, value.date, 1) })}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          ›
        </button>
      </div>

      <button
        type="button"
        onClick={() => onChange({ ...value, date: todayISO() })}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        Today
      </button>
    </div>
  )
}

/** Small helper for pages that just need a bare date picker next to a selector. */
export function AnchorDateInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className={cx(inputClass, 'w-auto')} />
}
