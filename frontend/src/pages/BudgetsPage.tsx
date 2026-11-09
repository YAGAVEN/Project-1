import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useBudgets, useCategories, useCreateBudget } from '../lib/queries'
import { formatINR, shiftAnchor, todayISO } from '../lib/format'
import type { BudgetPeriodType, BudgetUsage } from '../lib/types'
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

const PERIOD_LABELS: Record<BudgetPeriodType, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' }

/**
 * One grand total across period types is a lie (₹2,000 weekly + ₹8,000 monthly
 * is not ₹10,000 for the month), so totals are grouped per period type
 * (audit E-9). With a single period type this renders exactly one card.
 */
function totalsByPeriod(budgets: BudgetUsage[]): Array<{ periodType: BudgetPeriodType; budget: number; spent: number }> {
  const byPeriod = new Map<BudgetPeriodType, { budget: number; spent: number }>()
  for (const budget of budgets) {
    const totals = byPeriod.get(budget.periodType) ?? { budget: 0, spent: 0 }
    totals.budget += budget.amountLimit
    totals.spent += budget.used
    byPeriod.set(budget.periodType, totals)
  }
  return [...byPeriod.entries()]
    .map(([periodType, totals]) => ({ periodType, ...totals }))
    .sort((a, b) => b.budget - a.budget)
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
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-800 dark:bg-slate-900">
            <button type="button" aria-label="Previous month" onClick={() => setAnchor(shiftAnchor('MONTH', anchor, -1))} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">‹</button>
            <span className="min-w-36 px-2 text-center text-sm font-medium text-slate-700 dark:text-slate-300">{monthLabel(anchor)}</span>
            <button type="button" aria-label="Next month" onClick={() => setAnchor(shiftAnchor('MONTH', anchor, 1))} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">›</button>
          </div>
          <button type="button" onClick={() => setAnchor(todayISO())} className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">This month</button>
          <button type="button" onClick={() => setModalOpen(true)} className={primaryButtonClass}>+ New Budget</button>
        </div>
      </PageHeader>

      {/* mental model note (§15): templates recur — the month nav only changes ?date= */}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Budgets are recurring templates — "Food = ₹8,000 monthly" applies to every month automatically.
      </p>

      {isLoading || !data_ ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {totalsByPeriod(data_.budgets).map(({ periodType, budget, spent }) => (
              <StatCard
                key={periodType}
                label={`${PERIOD_LABELS[periodType]} total (${periodType.toLowerCase()})`}
                value={`${formatINR(spent)} of ${formatINR(budget)}`}
                tone={spent > budget ? 'negative' : 'default'}
              />
            ))}
          </div>

          {data_.budgets.length === 0 ? (
            <EmptyState>No budgets for {monthLabel(anchor)} — create your first one.</EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data_.budgets.map((budget) => (
                <Link key={budget.budgetId} to={`/budgets/${budget.budgetId}`} className="block">
                  <Card className="space-y-2 transition-colors hover:border-slate-300 hover:shadow-md dark:hover:border-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{budget.categoryName}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 dark:text-slate-500">{budget.periodType}</span>
                        <StatusBadge status={budget.status} />
                      </span>
                    </div>
                    <ProgressBar percentage={budget.percentageUsed} status={budget.status} />
                    <div className="flex items-center justify-between text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      <span>{formatINR(budget.used)} spent of {formatINR(budget.amountLimit)}</span>
                      <span className={cx(budget.remaining < 0 && 'font-medium text-expense')}>
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
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={creating} className={primaryButtonClass}>{creating ? 'Creating…' : 'Create budget'}</button>
        </div>
      </form>
    </Modal>
  )
}
