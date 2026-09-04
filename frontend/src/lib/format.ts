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

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function shiftAnchor(periodType: PeriodType, date: string, direction: 1 | -1): string {
  const d = new Date(`${date}T00:00:00`)
  if (periodType === 'DAY') d.setDate(d.getDate() + direction)
  if (periodType === 'WEEK') d.setDate(d.getDate() + 7 * direction)
  if (periodType === 'MONTH') d.setMonth(d.getMonth() + direction)
  if (periodType === 'YEAR') d.setFullYear(d.getFullYear() + direction)
  return d.toISOString().slice(0, 10)
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
export function formatDateLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Today'
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday'
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`
}
