import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useAccounts, useCategories, useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '../lib/queries'
import { todayISO } from '../lib/format'
import type { Transaction, TransactionBody, TransactionType } from '../lib/types'
import { Badge, Field, Modal, TypeBadge, cx, inputClass, primaryButtonClass, secondaryButtonClass, dangerButtonClass } from './ui'

interface DrawerApi {
  openCreate: () => void
  openEdit: (transaction: Transaction) => void
}

const DrawerContext = createContext<DrawerApi | null>(null)

export function useTransactionDrawer(): DrawerApi {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('useTransactionDrawer must be used inside <TransactionDrawerProvider>')
  }
  return context
}

interface DrawerState {
  open: boolean
  transaction: Transaction | null
}

/** frontend.md §3 — Add Transaction is reachable from anywhere in the app. */
export function TransactionDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState>({ open: false, transaction: null })

  const api: DrawerApi = {
    openCreate: () => setState({ open: true, transaction: null }),
    openEdit: (transaction) => setState({ open: true, transaction }),
  }

  return (
    <DrawerContext.Provider value={api}>
      {children}
      <TransactionDrawer
        open={state.open}
        transaction={state.transaction}
        onClose={() => setState({ open: false, transaction: null })}
      />
    </DrawerContext.Provider>
  )
}

const CREATE_TYPES: TransactionType[] = ['EXPENSE', 'INCOME', 'TRANSFER']
const isLoanType = (type: TransactionType) => type.startsWith('LOAN_')

interface FormState {
  transactionType: TransactionType
  amount: string
  fromAccountId: string
  toAccountId: string
  categoryId: string
  description: string
  transactionDate: string
  transactionTime: string
}

function emptyForm(type: TransactionType = 'EXPENSE'): FormState {
  return {
    transactionType: type,
    amount: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    description: '',
    transactionDate: todayISO(),
    transactionTime: '',
  }
}

function TransactionDrawer({
  open,
  transaction,
  onClose,
}: {
  open: boolean
  transaction: Transaction | null
  onClose: () => void
}) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const createTxn = useCreateTransaction()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = transaction !== null
  const updateTxn = useUpdateTransaction(transaction?.id ?? '')
  const deleteTxn = useDeleteTransaction(transaction?.id ?? '')

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(false)
    if (transaction) {
      setForm({
        transactionType: transaction.transactionType,
        amount: String(transaction.amount),
        fromAccountId: transaction.fromAccountId ?? '',
        toAccountId: transaction.toAccountId ?? '',
        categoryId: transaction.categoryId ?? '',
        description: transaction.description ?? '',
        transactionDate: transaction.transactionDate,
        transactionTime: transaction.transactionTime ?? '',
      })
    } else {
      setForm(emptyForm())
    }
  }, [open, transaction])

  const mode: 'view' | 'edit' | 'create' = transaction && isLoanType(transaction.transactionType)
    ? 'view'
    : editing
      ? 'edit'
      : 'create'

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const activeAccounts = accounts.filter((account) => account.isActive)
  const spendableFrom = activeAccounts // EXPENSE may use a credit card
  const incomeTargets = activeAccounts.filter((account) => account.accountType !== 'CREDIT_CARD')
  const categoryChoices = categories.filter(
    (category) =>
      category.isActive &&
      category.categoryType === (form.transactionType === 'INCOME' ? 'INCOME' : 'EXPENSE'),
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero.')
      return
    }

    const body: TransactionBody = {
      amount,
      description: form.description || null,
      transactionDate: form.transactionDate,
      transactionTime: form.transactionTime || null,
    }
    if (form.transactionType === 'EXPENSE') {
      body.fromAccountId = form.fromAccountId
      body.categoryId = form.categoryId
    } else if (form.transactionType === 'INCOME') {
      body.toAccountId = form.toAccountId
      body.categoryId = form.categoryId
    } else if (form.transactionType === 'TRANSFER') {
      body.fromAccountId = form.fromAccountId
      body.toAccountId = form.toAccountId
    }

    try {
      if (mode === 'create') {
        await createTxn.mutateAsync({ ...body, transactionType: form.transactionType })
      } else if (mode === 'edit' && transaction) {
        // type is immutable (§12) — it is not part of the update payload
        await updateTxn.mutateAsync(body)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function remove() {
    if (!transaction) return
    try {
      await deleteTxn.mutateAsync()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const busy = createTxn.isPending || updateTxn.isPending || deleteTxn.isPending

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Add Transaction' : mode === 'edit' ? 'Edit Transaction' : 'Transaction'}>
      {mode === 'view' && transaction ? (
        <LoanTxnView transaction={transaction} onClose={onClose} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {mode === 'create' && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {CREATE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...emptyForm(type) })}
                  className={cx(
                    'rounded-lg px-3 py-2 text-sm font-medium capitalize',
                    form.transactionType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                  )}
                >
                  {type.toLowerCase()}
                </button>
              ))}
            </div>
          )}

          {mode === 'edit' && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <TypeBadge transactionType={form.transactionType} />
              <span>type is immutable</span>
            </div>
          )}

          <Field label="Amount (₹)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => set('amount', event.target.value)}
              className={cx(inputClass, 'tabular-nums')}
            />
          </Field>

          {(form.transactionType === 'EXPENSE' || form.transactionType === 'TRANSFER') && (
            <Field label={form.transactionType === 'EXPENSE' ? 'From account' : 'From account'}>
              <select required value={form.fromAccountId} onChange={(event) => set('fromAccountId', event.target.value)} className={inputClass}>
                <option value="">Select account</option>
                {spendableFrom.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatBalance(account.balance)})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(form.transactionType === 'INCOME' || form.transactionType === 'TRANSFER') && (
            <Field label={form.transactionType === 'INCOME' ? 'To account' : 'To account (must differ)'}>
              <select required value={form.toAccountId} onChange={(event) => set('toAccountId', event.target.value)} className={inputClass}>
                <option value="">Select account</option>
                {(form.transactionType === 'INCOME' ? incomeTargets : activeAccounts).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatBalance(account.balance)})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {form.transactionType !== 'TRANSFER' && (
            <Field label="Category">
              <select required value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)} className={inputClass}>
                <option value="">Select category</option>
                {categoryChoices.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Description">
            <input
              type="text"
              maxLength={500}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                required
                value={form.transactionDate}
                onChange={(event) => set('transactionDate', event.target.value)}
                className={inputClass}
              />
            </Field>
            {form.transactionType !== 'TRANSFER' && (
              <Field label="Time (optional)">
                <input
                  type="time"
                  value={form.transactionTime}
                  onChange={(event) => set('transactionTime', event.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === 'edit' ? (
              confirmDelete ? (
                <button type="button" onClick={remove} className={dangerButtonClass}>
                  Confirm delete
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className={dangerButtonClass}>
                  Delete
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                {busy ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add transaction'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  )
}

function LoanTxnView({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="flex items-center gap-2">
        <TypeBadge transactionType={transaction.transactionType} />
        {transaction.categoryName && <Badge>{transaction.categoryName}</Badge>}
      </div>
      <div className="text-2xl font-semibold tabular-nums text-slate-900">₹{transaction.amount.toLocaleString('en-IN')}</div>
      <dl className="space-y-1 text-slate-500">
        <div>Account: {transaction.fromAccountName ?? transaction.toAccountName}</div>
        <div>Date: {transaction.transactionDate}</div>
        {transaction.description && <div>{transaction.description}</div>}
      </dl>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Loan movements are read-only here — manage them from the Loans page.
      </p>
      <div className="flex justify-end gap-2">
        <Link to="/loans" onClick={onClose} className={secondaryButtonClass}>Manage in Loans</Link>
        <button type="button" onClick={onClose} className={primaryButtonClass}>Close</button>
      </div>
    </div>
  )
}

function formatBalance(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
