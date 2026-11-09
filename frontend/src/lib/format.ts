import type { PeriodType } from './types'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
})

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Backend NUMERIC(14,2) values arrive as JSON numbers — render INR everywhere. */
export function formatINR(value: number | string): string {
  const numeric = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(numeric) ? inr.format(numeric) : '—'
}

/** Compact ₹ for chart axes. */
export function formatINRCompact(value: number): string {
  return inrCompact.format(value)
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * The local calendar date as ISO — never the UTC date. The previous
 * `toISOString().slice(0, 10)` implementation returned *yesterday* for
 * timezone-east-of-UTC users between local midnight and UTC midnight, which
 * misdated every transaction added in that window (audit P0/H-1).
 */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function parseISODate(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error(`Invalid ISO date: ${iso}`)
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/** Days in a month, leap years included — UTC construction, so no timezone enters the math. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Date-string arithmetic in pure ISO space: no local/UTC conversion, ever. */
export function addDaysISO(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/**
 * Month arithmetic with calendar-month clamping: Jan 31 + 1 month is Feb 28/29,
 * not a date spilled into March. The previous `setMonth` implementation both
 * spilled month-ends and lost a day per shift on UTC+ timezones (audit H-2).
 */
export function addMonthsISO(iso: string, months: number): string {
  const { y, m, d } = parseISODate(iso)
  const total = m - 1 + months
  const ny = y + Math.floor(total / 12)
  const nm = (((total % 12) + 12) % 12) + 1
  const nd = Math.min(d, daysInMonth(ny, nm))
  return `${ny}-${pad2(nm)}-${pad2(nd)}`
}

export function shiftAnchor(periodType: PeriodType, date: string, direction: 1 | -1): string {
  // rolling windows shift by their own span so windows never overlap
  switch (periodType) {
    case 'DAY':
      return addDaysISO(date, direction)
    case 'WEEK':
      return addDaysISO(date, 7 * direction)
    case 'MONTH':
      return addMonthsISO(date, direction)
    case 'THREE_MONTHS':
      return addMonthsISO(date, 3 * direction)
    case 'SIX_MONTHS':
      return addMonthsISO(date, 6 * direction)
    case 'YEAR':
      return addMonthsISO(date, 12 * direction)
  }
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Label under the period selector arrows, e.g. "September 2026". */
export function formatAnchor(periodType: PeriodType, date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (periodType === 'YEAR') return String(d.getFullYear())
  if (periodType === 'MONTH') return `${monthNames[d.getMonth()]} ${d.getFullYear()}`
  if (periodType === 'WEEK') {
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    const sameMonth = monday.getMonth() === sunday.getMonth()
    return sameMonth
      ? `${monday.getDate()}–${sunday.getDate()} ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`
      : `${monday.getDate()} ${monthNames[monday.getMonth()]} – ${sunday.getDate()} ${monthNames[sunday.getMonth()]}`
  }
  if (periodType === 'THREE_MONTHS' || periodType === 'SIX_MONTHS') {
    const months = periodType === 'THREE_MONTHS' ? 3 : 6
    const start = new Date(d)
    start.setMonth(start.getMonth() - months)
    start.setDate(start.getDate() + 1)
    return `${start.getDate()} ${monthNames[start.getMonth()]} – ${d.getDate()} ${monthNames[d.getMonth()]}`
  }
  return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`
}

/** Bucket label → short axis text. */
export function formatBucket(bucket: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
    const d = new Date(`${bucket}T00:00:00`)
    return `${d.getDate()} ${monthNames[d.getMonth()]}`
  }
  return bucket
}

/** "Today" / "Yesterday" / "12 Sep 2026" for ledger grouping. */
export function formatDateLabel(iso: string, now: Date = new Date()): string {
  const today = todayISO(now)
  if (iso === today) return 'Today'
  if (iso === addDaysISO(today, -1)) return 'Yesterday'
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`
}
