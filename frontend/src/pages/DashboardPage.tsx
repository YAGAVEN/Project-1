import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PeriodSelector } from '../components/PeriodSelector'
import { Badge, Card, EmptyState, ProgressBar, SectionTitle, Spinner, StatCard, StatusBadge, TypeBadge, cx } from '../components/ui'
import { useTransactionDrawer } from '../components/TransactionDrawer'
import { chartTheme } from '../lib/chartTheme'
import { formatBucket, formatINR, formatINRCompact, todayISO } from '../lib/format'
import { fetchTransaction, useDashboard, type Period } from '../lib/queries'
import { useTheme } from '../theme/ThemeContext'

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>({ periodType: 'MONTH', date: todayISO() })
  const [series, setSeries] = useState({ income: true, expense: true })
  const { theme } = useTheme()
  const ct = chartTheme(theme === 'dark')
  const { data: dashboard, isLoading } = useDashboard(period)
  const drawer = useTransactionDrawer()
  const navigate = useNavigate()

  if (isLoading || !dashboard) return <Spinner label="Loading dashboard…" />

  const { totals } = dashboard
  const attentionBudgets = dashboard.budgets.filter((budget) => budget.status !== 'OK')
  const attentionCards = dashboard.creditCards.filter((card) => card.outstanding > 0)
  const hasLoans = dashboard.loansSummary.totalReceivable > 0 || dashboard.loansSummary.totalPayable > 0

  /** §11 — clicking a recent row opens the drawer; the projection lacks ids, so fetch the full row. */
  async function openRecent(id: string) {
    try {
      drawer.openEdit(await fetchTransaction(id))
    } catch {
      // row may have been deleted moments ago — harmless
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Stat cards (§5) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Balance" value={formatINR(totals.totalBalance)} hint="Net across all accounts, right now" />
        <StatCard label="Income" value={formatINR(totals.income)} tone="positive" />
        <StatCard label="Expenses" value={formatINR(totals.expense)} tone="negative" />
        <StatCard
          label="Net Cash Flow"
          value={formatINR(totals.netCashFlow)}
          tone={totals.netCashFlow >= 0 ? 'positive' : 'negative'}
        />
      </div>

      {/* Needs-attention strip (§5) */}
      {(attentionBudgets.length > 0 || attentionCards.length > 0 || hasLoans) && (
        <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 font-medium text-amber-900 dark:text-amber-200">Needs attention:</span>
            {attentionBudgets.map((budget) => (
              <Link key={budget.budgetId} to={`/budgets/${budget.budgetId}`}>
                <Badge tone={budget.status === 'OVER' ? 'red' : 'amber'}>
                  {budget.categoryName} {budget.percentageUsed}%
                </Badge>
              </Link>
            ))}
            {attentionCards.map((card) => (
              <Link key={card.accountId} to={`/accounts/${card.accountId}`}>
                <Badge tone="red">
                  Card outstanding {formatINR(card.outstanding)}
                  {card.availableCredit !== null && ` · ${formatINR(card.availableCredit)} left`}
                </Badge>
              </Link>
            ))}
            {hasLoans && (
              <Link to="/loans">
                <Badge tone="amber">
                  {dashboard.loansSummary.totalReceivable > 0 && `You'll get ${formatINR(dashboard.loansSummary.totalReceivable)}`}
                  {dashboard.loansSummary.totalReceivable > 0 && dashboard.loansSummary.totalPayable > 0 && ' · '}
                  {dashboard.loansSummary.totalPayable > 0 && `You owe ${formatINR(dashboard.loansSummary.totalPayable)}`}
                </Badge>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Income vs Expense (§7) — series are toggleable */}
      <Card>
        <SectionTitle
          action={
            <div className="flex gap-1.5">
              <SeriesToggle
                label="Income"
                dot="bg-income"
                active={series.income}
                onClick={() => setSeries((s) => ({ ...s, income: !s.income }))}
              />
              <SeriesToggle
                label="Expense"
                dot="bg-expense"
                active={series.expense}
                onClick={() => setSeries((s) => ({ ...s, expense: !s.expense }))}
              />
            </div>
          }
        >
          Income vs Expense
        </SectionTitle>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dashboard.incomeExpenseSeries} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
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
              {series.income && <Bar dataKey="income" fill={ct.income} radius={[4, 4, 0, 0]} maxBarSize={22} />}
              {series.expense && <Bar dataKey="expense" fill={ct.expense} radius={[4, 4, 0, 0]} maxBarSize={22} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Expense breakdown donut (§8) */}
        <Card>
          <SectionTitle>Expense Breakdown</SectionTitle>
          {dashboard.expenseByCategory.length === 0 ? (
            <EmptyState>No expenses in this period.</EmptyState>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dashboard.expenseByCategory}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      strokeWidth={0}
                      onClick={(entry) => {
                        if (entry && typeof entry === 'object' && 'categoryId' in entry) {
                          navigate(`/transactions?categoryId=${entry.categoryId}&type=EXPENSE`)
                        }
                      }}
                    >
                      {dashboard.expenseByCategory.map((slice, index) => (
                        <Cell key={slice.categoryId} fill={ct.donut[index % ct.donut.length]} className="cursor-pointer" />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={ct.tooltip.contentStyle} itemStyle={ct.tooltip.itemStyle} labelStyle={ct.tooltip.labelStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {dashboard.expenseByCategory.slice(0, 6).map((slice, index) => (
                  <li key={slice.categoryId} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot className="shrink-0" style={{ backgroundColor: ct.donut[index % ct.donut.length] }} />
                      <span className="truncate text-slate-700 dark:text-slate-300">{slice.name}</span>
                    </span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {formatINR(slice.amount)} · {slice.percentage}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Budget overview (§9) */}
        <Card>
          <SectionTitle action={<Link to="/budgets" className="text-xs font-medium text-emerald-700 hover:underline dark:text-income">Manage budgets</Link>}>
            Budget Overview
          </SectionTitle>
          {dashboard.budgets.length === 0 ? (
            <EmptyState>No budgets yet — create one on the Budgets page.</EmptyState>
          ) : (
            <div className="space-y-4">
              {dashboard.budgets.map((budget) => (
                <Link key={budget.budgetId} to={`/budgets/${budget.budgetId}`} className="block space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{budget.categoryName}</span>
                    <span className="flex items-center gap-2 tabular-nums text-slate-500 dark:text-slate-400">
                      {formatINR(budget.used)} / {formatINR(budget.amountLimit)}
                      <StatusBadge status={budget.status} />
                    </span>
                  </div>
                  <ProgressBar percentage={budget.percentageUsed} status={budget.status} />
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Account balances (§10) */}
      <Card>
        <SectionTitle action={<Link to="/accounts" className="text-xs font-medium text-emerald-700 hover:underline dark:text-income">All accounts</Link>}>
          Account Balances
        </SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dashboard.accountBalances.map((account) => (
            <Link
              key={account.accountId}
              to={`/accounts/${account.accountId}`}
              className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{account.name}</span>
                <Badge tone={account.accountType === 'CREDIT_CARD' ? 'red' : 'gray'}>
                  {account.accountType === 'CREDIT_CARD' ? 'Card' : account.accountType === 'INVESTMENT' ? 'Invest' : account.accountType}
                </Badge>
              </div>
              <div className={cx('mt-2 text-xl font-semibold tabular-nums', account.balance < 0 ? 'text-expense' : 'text-slate-900 dark:text-slate-100')}>
                {formatINR(account.balance)}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Recent transactions (§11) */}
      <Card>
        <SectionTitle action={<Link to="/transactions" className="text-xs font-medium text-emerald-700 hover:underline dark:text-income">View all</Link>}>
          Recent Transactions
        </SectionTitle>
        {dashboard.recentTransactions.length === 0 ? (
          <EmptyState>
            Nothing yet — hit <button type="button" onClick={drawer.openCreate} className="font-medium text-emerald-700 underline dark:text-income">Add Transaction</button> to get started.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {dashboard.recentTransactions.map((txn) => (
              <li key={txn.id}>
                <button
                  type="button"
                  onClick={() => void openRecent(txn.id)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-slate-800 dark:text-slate-100">{txn.description ?? txn.categoryName ?? 'Transaction'}</span>
                    <TypeBadge transactionType={txn.transactionType} />
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-slate-500 dark:text-slate-400">
                    <span className="hidden text-xs sm:inline">{txn.accountName ?? txn.counterAccountName}</span>
                    <span className="text-xs">{txn.transactionDate}</span>
                    <span className={cx('w-24 text-right font-medium tabular-nums', txn.transactionType === 'INCOME' || txn.transactionType === 'LOAN_REPAYMENT_IN' || txn.transactionType === 'LOAN_RECEIVED' ? 'text-income' : 'text-slate-800 dark:text-slate-100')}>
                      {txn.transactionType === 'INCOME' ? '+' : txn.transactionType === 'EXPENSE' ? '−' : ''}
                      {formatINR(txn.amount)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Dot({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cx('inline-block h-2.5 w-2.5 rounded-full', className)} style={style} />
}

/** §7 — income/expense series toggle chip. */
function SeriesToggle({
  label,
  dot,
  active,
  onClick,
}: {
  label: string
  dot: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-slate-300 bg-white text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
          : 'border-transparent bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500',
      )}
    >
      <span className={cx('h-2.5 w-2.5 rounded-full', dot, !active && 'opacity-30')} />
      {label}
    </button>
  )
}
