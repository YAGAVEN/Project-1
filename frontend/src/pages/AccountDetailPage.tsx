import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PeriodSelector } from '../components/PeriodSelector'
import { useTheme } from '../theme/ThemeContext'
import { chartTheme } from '../lib/chartTheme'
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Spinner,
  StatCard,
  TypeBadge,
  dangerButtonClass,
  secondaryButtonClass,
} from '../components/ui'
import { AccountModal, TYPE_LABELS } from './AccountsPage'
import { formatBucket, formatINR, formatINRCompact, todayISO } from '../lib/format'
import { useAccountDetail, useDeleteAccount, useUpdateAccount, type Period } from '../lib/queries'

export function AccountDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>({ periodType: 'MONTH', date: todayISO() })
  const { data: account, isLoading } = useAccountDetail(id, period)
  const updateAccount = useUpdateAccount(id ?? '')
  const deleteAccount = useDeleteAccount(id ?? '')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { theme } = useTheme()
  const ct = chartTheme(theme === 'dark')

  if (isLoading || !account) return <Spinner label="Loading account…" />

  const isCard = account.accountType === 'CREDIT_CARD'
  const utilization =
    isCard && account.creditLimit && account.creditLimit > 0 && account.cardMetrics
      ? (account.cardMetrics.outstanding / account.creditLimit) * 100
      : null

  async function remove() {
    // §14 deletion policy: the API deactivates when history exists
    await deleteAccount.mutateAsync()
    navigate('/accounts')
  }

  return (
    <div className="space-y-6">
      <PageHeader title={account.name}>
        <div className="flex items-center gap-2">
          <Link to="/accounts" className={secondaryButtonClass}>← Accounts</Link>
          <button type="button" onClick={() => setEditOpen(true)} className={secondaryButtonClass}>Edit</button>
          {confirmDelete ? (
            <button type="button" onClick={remove} className={dangerButtonClass}>
              {isCard ? 'Confirm' : 'Confirm delete'}
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={dangerButtonClass}>
              Delete
            </button>
          )}
        </div>
      </PageHeader>
      {confirmDelete && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Accounts with history are deactivated (kept for the ledger), not deleted.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={isCard ? 'red' : 'blue'}>{TYPE_LABELS[account.accountType]}</Badge>
        {!account.isActive && <Badge tone="gray">Inactive</Badge>}
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current Balance" value={formatINR(account.balance)} tone={account.balance < 0 ? 'negative' : 'default'} />
        <StatCard label="Money In" value={formatINR(account.moneyIn)} tone="positive" hint="Selected period" />
        <StatCard label="Money Out" value={formatINR(account.moneyOut)} tone="negative" hint="Selected period" />
        {isCard && account.cardMetrics ? (
          <StatCard
            label="Outstanding"
            value={formatINR(account.cardMetrics.outstanding)}
            tone="negative"
            hint={
              account.cardMetrics.availableCredit !== null
                ? `${formatINR(account.cardMetrics.availableCredit)} available${utilization !== null ? ` · ${utilization.toFixed(0)}% used` : ''}`
                : undefined
            }
          />
        ) : (
          <StatCard label="Opening Balance" value={formatINR(account.openingBalance)} />
        )}
      </div>

      <Card>
        <SectionTitle>Balance Trend</SectionTitle>
        {account.balanceTrend.length === 0 ? (
          <EmptyState>No data in this period.</EmptyState>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={account.balanceTrend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 11, fill: ct.tickFill }} stroke={ct.axis} />
                <YAxis tickFormatter={(value: number) => formatINRCompact(value)} tick={{ fontSize: 11, fill: ct.tickFill }} stroke={ct.axis} width={70} />
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  labelFormatter={(label) => formatBucket(String(label))}
                  contentStyle={ct.tooltip.contentStyle}
                  itemStyle={ct.tooltip.itemStyle}
                  labelStyle={ct.tooltip.labelStyle}
                />
                <Line type="monotone" dataKey="closingBalance" stroke={ct.brand} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Recent Transactions</SectionTitle>
        {account.recentTransactions.length === 0 ? (
          <EmptyState>No transactions on this account yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {account.recentTransactions.map((txn) => (
              <li key={txn.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-slate-800 dark:text-slate-100">{txn.description ?? txn.categoryName ?? 'Transaction'}</span>
                  <TypeBadge transactionType={txn.transactionType as never} />
                </span>
                <span className="flex shrink-0 items-center gap-3 text-slate-500 dark:text-slate-400">
                  {txn.counterAccountName && <span className="hidden text-xs sm:inline">{txn.counterAccountName}</span>}
                  <span className="text-xs">{txn.transactionDate}</span>
                  <span className="w-24 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatINR(txn.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AccountModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={updateAccount.mutateAsync}
        submitting={updateAccount.isPending}
        submitLabel="Save changes"
        initial={{
          name: account.name,
          accountType: account.accountType,
          creditLimit: account.creditLimit,
          billingDay: account.billingDay,
          paymentDueDay: account.paymentDueDay,
        }}
        isCard={isCard}
      />
    </div>
  )
}
