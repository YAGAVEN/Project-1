import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useBudgets, useCategories, useCreateBudget } from '../lib/queries'
import { formatINR, todayISO } from '../lib/format'
import type { BudgetPeriodType } from '../lib/types'
import {
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  StatusBadge,
  cx,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function monthLabel(anchor: string): string {
  const d = new Date(`${anchor}T00:00:00`)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function shiftMonth(anchor: string, direction: 1 | -1): string {
  const d = new Date(`${anchor}T00:00:00`)
  d.setMonth(d.getMonth() + direction)
  return d.toISOString().slice(0, 10)
}

export function BudgetsPage() {
  const [anchor, setAnchor] = useState(todayISO())
  const { data: data_, isLoading } = useBudgets(anchor)
  const createBudget = useCreateBudget()
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title="Budgets">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
            <button type="button" aria-label="Previous month" onClick={() => setAnchor(shiftMonth(anchor, -1))} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">‹</button>
            <span className="min-w-36 px-2 text-center text-sm font-medium text-slate-700">{monthLabel(anchor)}</span>
            <button type="button" aria-label="Next month" onClick={() => setAnchor(shiftMonth(anchor, 1))} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">›</button>
          </div>
          <button type="button" onClick={() => setAnchor(todayISO())} className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">This month</button>
          <button type="button" onClick={() => setModalOpen(true)} className={primaryButtonClass}>+ New Budget</button>
        </div>
      </PageHeader>

      {/* mental model note (§15): templates recur — the month nav only changes ?date= */}
      <p className="text-xs text-slate-500">
        Budgets are recurring templates — "Food = ₹8,000 monthly" applies to every month automatically.
      </p>

      {isLoading || !data_ ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Budget" value={formatINR(data_.totals.totalBudget)} />
            <StatCard label="Total Spent" value={formatINR(data_.totals.totalSpent)} tone="negative" />
            <StatCard
              label="Total Remaining"
              value={formatINR(data_.totals.totalRemaining)}
              tone={data_.totals.totalRemaining >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {data_.budgets.length === 0 ? (
            <EmptyState>No budgets for {monthLabel(anchor)} — create your first one.</EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data_.budgets.map((budget) => (
                <Link key={budget.budgetId} to={`/budgets/${budget.budgetId}`} className="block">
                  <Card className="space-y-2 transition-colors hover:border-slate-300 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900">{budget.categoryName}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{budget.periodType}</span>
                        <StatusBadge status={budget.status} />
                      </span>
                    </div>
                    <ProgressBar percentage={budget.percentageUsed} status={budget.status} />
                    <div className="flex items-center justify-between text-xs tabular-nums text-slate-500">
                      <span>{formatINR(budget.used)} spent of {formatINR(budget.amountLimit)}</span>
                      <span className={cx(budget.remaining < 0 && 'font-medium text-rose-600')}>
                        {budget.remaining < 0 ? `${formatINR(-budget.remaining)} over` : `${formatINR(budget.remaining)} left`}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      <NewBudgetModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={createBudget.mutateAsync} creating={createBudget.isPending} />
    </div>
  )
}

function NewBudgetModal({
  open,
  onClose,
  onCreate,
  creating,
}: {
  open: boolean
  onClose: () => void
  onCreate: (body: { categoryId: string; amountLimit: number; periodType: BudgetPeriodType }) => Promise<unknown>
  creating: boolean
}) {
  const { data: categories = [] } = useCategories()
  const [categoryId, setCategoryId] = useState('')
  const [amountLimit, setAmountLimit] = useState('')
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('MONTHLY')
  const [error, setError] = useState<string | null>(null)

  const expenseCategories = categories.filter((category) => category.isActive && category.categoryType === 'EXPENSE')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await onCreate({ categoryId, amountLimit: Number(amountLimit), periodType })
      setCategoryId('')
      setAmountLimit('')
      onClose()
    } catch (err) {
      // §15 — surface the duplicate-template 409 as a friendly message
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Budget">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Category (expenses only)">
          <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>
            <option value="">Select category</option>
            {expenseCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Monthly limit (₹)">
          <input required type="number" min="0.01" step="0.01" value={amountLimit} onChange={(event) => setAmountLimit(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
        </Field>
        <Field label="Period">
          <select value={periodType} onChange={(event) => setPeriodType(event.target.value as BudgetPeriodType)} className={inputClass}>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="YEARLY">Yearly</option>
          </select>
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={creating} className={primaryButtonClass}>{creating ? 'Creating…' : 'Create budget'}</button>
        </div>
      </form>
    </Modal>
  )
}
