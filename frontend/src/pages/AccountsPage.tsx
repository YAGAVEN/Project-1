import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useAccounts, useCreateAccount } from '../lib/queries'
import { formatINR } from '../lib/format'
import type { AccountType } from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Spinner,
  cx,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

export const TYPE_LABELS: Record<AccountType, string> = {
  BANK: 'Bank',
  CASH: 'Cash',
  CREDIT_CARD: 'Credit card',
  INVESTMENT: 'Investment',
}

export function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const [modalOpen, setModalOpen] = useState(false)

  const netPosition = accounts.reduce((sum, account) => sum + account.balance, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts">
        <button type="button" onClick={() => setModalOpen(true)} className={primaryButtonClass}>
          + Add Account
        </button>
      </PageHeader>

      <Card>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Net Position</div>
        <div className={cx('mt-1 text-3xl font-semibold tabular-nums', netPosition < 0 ? 'text-rose-600' : 'text-slate-900')}>
          {formatINR(netPosition)}
        </div>
        <p className="mt-1 text-xs text-slate-500">Credit cards count negative — that's money you owe.</p>
      </Card>

      {isLoading ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <EmptyState>No accounts yet — add your first bank account or wallet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Link key={account.id} to={`/accounts/${account.id}`} className="block">
              <Card className="transition-colors hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-slate-800">{account.name}</span>
                  <Badge tone={account.accountType === 'CREDIT_CARD' ? 'red' : 'blue'}>{TYPE_LABELS[account.accountType]}</Badge>
                </div>
                <div className={cx('mt-3 text-2xl font-semibold tabular-nums', account.balance < 0 ? 'text-rose-600' : 'text-slate-900')}>
                  {formatINR(account.balance)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {account.accountType === 'CREDIT_CARD' && account.creditLimit !== null
                    ? `${formatINR(account.creditLimit - Math.max(0, -account.balance))} credit available`
                    : `Opened with ${formatINR(account.openingBalance)}`}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <AccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={createAccount.mutateAsync}
        submitting={createAccount.isPending}
        submitLabel="Add account"
      />
    </div>
  )
}

/** Shared by the list page (create) and the detail page (edit). */
export function AccountModal({
  open,
  onClose,
  onSubmit,
  submitting,
  submitLabel,
  initial,
  isCard,
}: {
  open: boolean
  onClose: () => void
  /** The payload shape differs between create and edit — callers own the type. */
  onSubmit: (body: never) => Promise<unknown>
  submitting: boolean
  submitLabel: string
  initial?: {
    name: string
    accountType: AccountType
    creditLimit: number | null
    billingDay: number | null
    paymentDueDay: number | null
  }
  /** Only needed when editing (create mode derives it from the selected type). */
  isCard?: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'BANK')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [creditLimit, setCreditLimit] = useState(initial?.creditLimit != null ? String(initial.creditLimit) : '')
  const [billingDay, setBillingDay] = useState(initial?.billingDay != null ? String(initial.billingDay) : '')
  const [paymentDueDay, setPaymentDueDay] = useState(initial?.paymentDueDay != null ? String(initial.paymentDueDay) : '')
  const [error, setError] = useState<string | null>(null)

  const typeLocked = initial !== undefined // type never changes after creation

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      if (initial) {
        await onSubmit({
          name,
          ...(isCard
            ? {
                creditLimit: Number(creditLimit),
                billingDay: billingDay ? Number(billingDay) : undefined,
                paymentDueDay: paymentDueDay ? Number(paymentDueDay) : undefined,
              }
            : {}),
        } as never)
      } else {
        if (accountType === 'CREDIT_CARD' && !creditLimit) {
          setError('A credit card needs a credit limit.')
          return
        }
        await onSubmit({
          name,
          accountType,
          openingBalance: Number(openingBalance) || 0,
          ...(accountType === 'CREDIT_CARD'
            ? {
                creditLimit: Number(creditLimit),
                billingDay: billingDay ? Number(billingDay) : null,
                paymentDueDay: paymentDueDay ? Number(paymentDueDay) : null,
              }
            : {}),
        } as never)
      }
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Account' : 'Add Account'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. HDFC Savings" />
        </Field>

        {!typeLocked && (
          <Field label="Type">
            <select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)} className={inputClass}>
              <option value="BANK">Bank</option>
              <option value="CASH">Cash wallet</option>
              <option value="CREDIT_CARD">Credit card</option>
              <option value="INVESTMENT">Investment</option>
            </select>
          </Field>
        )}

        {!typeLocked && (
          <Field label="Opening balance (₹)">
            <input type="number" step="0.01" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
          </Field>
        )}

        {(isCard || (!typeLocked && accountType === 'CREDIT_CARD')) && (
          <>
            <Field label="Credit limit (₹)">
              <input required type="number" min="0.01" step="0.01" value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Billing day">
                <input type="number" min="1" max="31" value={billingDay} onChange={(event) => setBillingDay(event.target.value)} className={inputClass} placeholder="1–31" />
              </Field>
              <Field label="Payment due day">
                <input type="number" min="1" max="31" value={paymentDueDay} onChange={(event) => setPaymentDueDay(event.target.value)} className={inputClass} placeholder="1–31" />
              </Field>
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={submitting} className={primaryButtonClass}>{submitting ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  )
}
