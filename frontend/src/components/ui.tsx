import type { ReactNode } from 'react'
import type { BudgetStatus, TransactionType } from '../lib/types'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {children}
    </div>
  )
}

export function StatCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'negative'
  hint?: string
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cx(
          'mt-2 text-2xl font-semibold tabular-nums',
          tone === 'positive' && 'text-emerald-600',
          tone === 'negative' && 'text-rose-600',
          tone === 'default' && 'text-slate-900',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  )
}

const badgeTones = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-sky-700',
} as const

export function Badge({
  children,
  tone = 'gray',
}: {
  children: ReactNode
  tone?: keyof typeof badgeTones
}) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone])}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: BudgetStatus }) {
  const tone = status === 'OK' ? 'green' : status === 'WARNING' ? 'amber' : 'red'
  const label = status === 'OVER' ? 'OVER BUDGET' : status
  return <Badge tone={tone}>{label}</Badge>
}

const typeMeta: Record<TransactionType, { label: string; tone: keyof typeof badgeTones }> = {
  INCOME: { label: 'Income', tone: 'green' },
  EXPENSE: { label: 'Expense', tone: 'red' },
  TRANSFER: { label: 'Transfer', tone: 'blue' },
  LOAN_GIVEN: { label: 'Loan given', tone: 'amber' },
  LOAN_RECEIVED: { label: 'Loan received', tone: 'amber' },
  LOAN_REPAYMENT_IN: { label: 'Loan', tone: 'amber' },
  LOAN_REPAYMENT_OUT: { label: 'Loan', tone: 'amber' },
}

export function TypeBadge({ transactionType }: { transactionType: TransactionType }) {
  const meta = typeMeta[transactionType]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export function ProgressBar({
  percentage,
  status,
  className,
}: {
  percentage: number
  status?: BudgetStatus
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, percentage))
  const fill = status === 'OVER' ? 'bg-rose-500' : status === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cx('h-full rounded-full transition-all', fill)} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label ?? 'Loading…'}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={cx(
          'max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none'

export const primaryButtonClass =
  'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'

export const secondaryButtonClass =
  'rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'

export const dangerButtonClass =
  'rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50'
