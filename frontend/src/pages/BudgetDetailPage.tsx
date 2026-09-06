import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  errorMessage,
  useBudgetHistory,
  useBudgetTransactions,
  useDeleteBudget,
  useUpdateBudget,
} from '../lib/queries'
import { formatBucket, formatDateLabel, formatINR, formatINRCompact, todayISO } from '../lib/format'
import { useTheme } from '../theme/ThemeContext'
import { chartTheme } from '../lib/chartTheme'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SectionTitle,
  Spinner,
  StatCard,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

export function BudgetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: history, isLoading } = useBudgetHistory(id)
  const { data: ledger } = useBudgetTransactions(id, todayISO())
  const updateBudget = useUpdateBudget(id ?? '')
  const deleteBudget = useDeleteBudget(id ?? '')
  const [editOpen, setEditOpen] = useState(false)
  const [amountLimit, setAmountLimit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()
  const ct = chartTheme(theme === 'dark')

  if (isLoading || !history) return <Spinner label="Loading budget…" />

  const current = history.points[history.points.length - 1]

  async function saveLimit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await updateBudget.mutateAsync({ amountLimit: Number(amountLimit) })
      setEditOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove() {
    await deleteBudget.mutateAsync()
    navigate('/budgets')
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${history.categoryName} budget`}>
        <div className="flex items-center gap-2">
          <Link to="/budgets" className={secondaryButtonClass}>← Budgets</Link>
          <button
            type="button"
            onClick={() => {
              setAmountLimit(String(history.amountLimit))
              setEditOpen(true)
            }}
            className={secondaryButtonClass}
          >
            Edit limit
          </button>
          <button type="button" onClick={remove} className={dangerButtonClass}>Delete</button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Limit" value={formatINR(history.amountLimit)} hint={history.periodType} />
        <StatCard label="Spent (this period)" value={formatINR(current?.used ?? 0)} tone="negative" />
        <StatCard
          label="Remaining"
          value={formatINR(history.amountLimit - (current?.used ?? 0))}
          tone={history.amountLimit - (current?.used ?? 0) >= 0 ? 'positive' : 'negative'}
        />
        <StatCard label="Status" value={current?.status ?? '—'} tone={current?.status === 'OVER' ? 'negative' : 'default'} />
      </div>

      <Card>
        <SectionTitle action={<Badge>{history.periodType.toLowerCase()}</Badge>}>Spending per period</SectionTitle>
        {history.points.length === 0 ? (
          <EmptyState>No history yet.</EmptyState>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis
                  dataKey="window"
                  tickFormatter={(window: { startDate: string }) => formatBucket(window.startDate)}
                  tick={{ fontSize: 11, fill: ct.tickFill }}
                  stroke={ct.axis}
                />
                <YAxis tickFormatter={(value: number) => formatINRCompact(value)} tick={{ fontSize: 11, fill: ct.tickFill }} stroke={ct.axis} width={70} />
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  labelFormatter={(label) => formatBucket(String(label))}
                  contentStyle={ct.tooltip.contentStyle}
                  itemStyle={ct.tooltip.itemStyle}
                  labelStyle={ct.tooltip.labelStyle}
                />
                <Bar dataKey="used" fill={ct.brand} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Contributing transactions (this period)</SectionTitle>
        {!ledger || ledger.content.length === 0 ? (
          <EmptyState>Nothing spent against this budget in the current period.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ledger.content.map((txn) => (
              <li key={txn.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-100">{txn.description ?? txn.categoryName}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{txn.fromAccountName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateLabel(txn.transactionDate)}</span>
                  <span className="w-24 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatINR(txn.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit budget limit">
        <form onSubmit={saveLimit} className="space-y-4">
          <Field label={`Limit (₹) — ${history.periodType.toLowerCase()}`}>
            <input required type="number" min="0.01" step="0.01" value={amountLimit} onChange={(event) => setAmountLimit(event.target.value)} className={cxInput} />
          </Field>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={updateBudget.isPending} className={primaryButtonClass}>
              {updateBudget.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

const cxInput = `${inputClass} tabular-nums`
