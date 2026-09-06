import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTransactionDrawer } from '../components/TransactionDrawer'
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard, TypeBadge, cx, inputClass, primaryButtonClass } from '../components/ui'
import { formatDateLabel, formatINR, todayISO } from '../lib/format'
import { useAccounts, useCategories, useTransactionSummary, useTransactions, type TransactionFilters } from '../lib/queries'
import type { Transaction } from '../lib/types'

const PAGE_SIZE = 20

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const drawer = useTransactionDrawer()

  // drill-down entry points (dashboard donut, dashboard rows) seed the filters
  const [search, setSearch] = useState('')
  const [type, setType] = useState(searchParams.get('type') ?? '')
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '')
  const [accountId, setAccountId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)

  // re-seed when arriving from another page while already mounted
  useEffect(() => {
    setType(searchParams.get('type') ?? '')
    setCategoryId(searchParams.get('categoryId') ?? '')
    setPage(0)
  }, [searchParams])

  const filters: TransactionFilters = {
    ...(type ? { type } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(accountId ? { accountId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(search ? { q: search } : {}),
    page,
    size: PAGE_SIZE,
  }

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: summary } = useTransactionSummary(todayISO())
  const { data: result, isLoading } = useTransactions(filters)

  const totalPages = result ? Math.max(1, Math.ceil(result.totalElements / PAGE_SIZE)) : 1

  const groups = new Map<string, Transaction[]>()
  for (const txn of result?.content ?? []) {
    const list = groups.get(txn.transactionDate) ?? []
    list.push(txn)
    groups.set(txn.transactionDate, list)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions">
        <button type="button" onClick={drawer.openCreate} className={primaryButtonClass}>
          + Add Transaction
        </button>
      </PageHeader>

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Income this month" value={formatINR(summary.income)} tone="positive" />
          <StatCard label="Expenses this month" value={formatINR(summary.expense)} tone="negative" />
          <StatCard
            label="Net cash flow"
            value={formatINR(summary.netCashFlow)}
            tone={summary.netCashFlow >= 0 ? 'positive' : 'negative'}
            hint={`${summary.count} transactions`}
          />
        </div>
      )}

      {/* Controls (§12) — search on its own row, filters + date range beneath */}
      <Card className="space-y-3">
        <input
          type="search"
          placeholder="Search transactions…  (press Enter)"
          defaultValue={search}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              setSearch((event.target as HTMLInputElement).value)
              setPage(0)
            }
          }}
          onBlur={(event) => {
            if (event.target.value !== search) {
              setSearch(event.target.value)
              setPage(0)
            }
          }}
          className={inputClass}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Type</span>
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(0) }} className={inputClass}>
              <option value="">All</option>
              <option value="INCOME">Income</option>
              <option value="EXPENSE">Expense</option>
              <option value="TRANSFER">Transfer</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Category</span>
            <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(0) }} className={inputClass}>
              <option value="">All</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Account</span>
            <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(0) }} className={inputClass}>
              <option value="">All</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">From date</span>
            <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0) }} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">To date</span>
            <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0) }} className={inputClass} />
          </label>
        </div>
      </Card>

      {/* Ledger grouped by date, newest first (§12) */}
      {isLoading ? (
        <Spinner />
      ) : !result || result.content.length === 0 ? (
        <EmptyState>No transactions match these filters.</EmptyState>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, txns]) => (
            <div key={date}>
              <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {formatDateLabel(date)}
              </div>
              <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
                {txns.map((txn) => <TransactionRow key={txn.id} txn={txn} />)}
              </Card>
            </div>
          ))}

          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>{result.totalElements} transactions</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className={cx(inputClass, 'w-auto px-3 disabled:opacity-40')}>
                ‹ Prev
              </button>
              <span className="tabular-nums">Page {page + 1} of {totalPages}</span>
              <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)} className={cx(inputClass, 'w-auto px-3 disabled:opacity-40')}>
                Next ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TransactionRow({ txn }: { txn: Transaction }) {
  const drawer = useTransactionDrawer()
  const loanType = txn.transactionType.startsWith('LOAN_')
  const credit = txn.transactionType === 'INCOME' || txn.transactionType === 'LOAN_REPAYMENT_IN' || txn.transactionType === 'LOAN_RECEIVED'

  const accountLine = txn.transactionType === 'TRANSFER'
    ? `${txn.fromAccountName ?? '?'} → ${txn.toAccountName ?? '?'}`
    : txn.fromAccountName ?? txn.toAccountName ?? ''

  return (
    <button
      type="button"
      onClick={() => drawer.openEdit(txn)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-slate-800 dark:text-slate-100">
          {txn.description || txn.categoryName || accountLine || 'Transaction'}
        </span>
        {txn.categoryName && txn.description && <span className="hidden truncate text-slate-400 sm:inline dark:text-slate-500">{txn.categoryName}</span>}
        {loanType && <TypeBadge transactionType={txn.transactionType} />}
        {txn.transactionType === 'TRANSFER' && <Badge tone="blue">Transfer</Badge>}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-slate-400 md:inline dark:text-slate-500">{accountLine}</span>
        <span className={cx('w-28 text-right font-medium tabular-nums', credit ? 'text-income' : 'text-slate-900 dark:text-slate-100')}>
          {credit ? '+' : txn.transactionType === 'EXPENSE' ? '−' : ''}
          {formatINR(txn.amount)}
        </span>
      </span>
    </button>
  )
}
