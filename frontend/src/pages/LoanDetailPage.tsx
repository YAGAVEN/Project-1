import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useAccounts, useDeleteLoan, useDeletePayment, useLoanDetail, useRecordPayment } from '../lib/queries'
import { formatDateLabel, formatINR, todayISO } from '../lib/format'
import {
  Badge,
  Card,
  Field,
  Modal,
  PageHeader,
  SectionTitle,
  Spinner,
  StatCard,
  cx,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

export function LoanDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: loan, isLoading } = useLoanDetail(id)
  const recordPayment = useRecordPayment(id ?? '')
  const deletePayment = useDeletePayment(id ?? '')
  const deleteLoan = useDeleteLoan(id ?? '')
  const { data: accounts = [] } = useAccounts()

  const [payOpen, setPayOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading || !loan) return <Spinner label="Loading loan…" />

  const payments = loan.payments ?? []

  async function remove() {
    // §18 — 409 if payments exist; the message surfaces automatically
    try {
      await deleteLoan.mutateAsync()
      navigate('/loans')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={loan.contactName}>
        <div className="flex items-center gap-2">
          <Link to="/loans" className={secondaryButtonClass}>← Loans</Link>
          {confirmDelete ? (
            <button type="button" onClick={remove} className={dangerButtonClass}>Confirm delete</button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={dangerButtonClass}>Delete</button>
          )}
        </div>
      </PageHeader>
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={loan.loanType === 'LENT' ? 'You lent' : 'You borrowed'}
          value={formatINR(loan.originalAmount)}
          hint={`on ${loan.loanDate}`}
        />
        <StatCard
          label={loan.loanType === 'LENT' ? 'Still to be paid to you' : 'You still owe'}
          value={formatINR(loan.outstanding)}
          tone={loan.outstanding > 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Paid back so far"
          value={`${Math.round(((loan.originalAmount - loan.outstanding) / loan.originalAmount) * 100)}%`}
          hint={`${formatINR(loan.originalAmount - loan.outstanding)} of ${formatINR(loan.originalAmount)}`}
        />
        <StatCard
          label="Status"
          value={loan.status === 'PAID' ? 'All settled' : 'Active'}
          tone={loan.status === 'PAID' ? 'positive' : 'default'}
        />
      </div>

      <Card>
        <SectionTitle
          action={
            loan.status !== 'PAID' ? (
              <button type="button" onClick={() => setPayOpen(true)} className={primaryButtonClass}>+ Add Payment</button>
            ) : (
              <Badge tone="green">All settled</Badge>
            )
          }
        >
          Timeline
        </SectionTitle>

        <div className="space-y-3">
          <TimelineRow
            label={loan.loanType === 'LENT' ? 'You lent' : 'You borrowed'}
            sub={loan.description ?? undefined}
            amount={formatINR(loan.originalAmount)}
            first
          />
          {payments.map((payment) => (
            <TimelineRow
              key={payment.id}
              label={
                loan.loanType === 'LENT'
                  ? `${loan.contactName} paid back on ${formatDateLabel(payment.paymentDate)}`
                  : `You paid back on ${formatDateLabel(payment.paymentDate)}`
              }
              sub={payment.accountName ? `into ${payment.accountName}` : undefined}
              amount={formatINR(payment.amount)}
              action={
                <button
                  type="button"
                  onClick={() => void deletePayment.mutateAsync(payment.id)}
                  className="text-xs text-rose-500 hover:underline dark:text-rose-400"
                >
                  remove
                </button>
              }
            />
          ))}
          <TimelineRow
            label={loan.outstanding === 0 ? 'Nothing left — all settled' : loan.loanType === 'LENT' ? 'Still to be paid to you' : 'You still owe'}
            amount={formatINR(loan.outstanding)}
            last
          />
        </div>
      </Card>

      {loan.accountName && (
        <Card>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The origin movement and every repayment are real transactions on <span className="font-medium text-slate-700 dark:text-slate-300">{loan.accountName}</span>.
          </p>
        </Card>
      )}

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSave={recordPayment.mutateAsync}
        saving={recordPayment.isPending}
        accounts={accounts.filter((account) => account.isActive && account.accountType !== 'CREDIT_CARD').map((account) => ({ id: account.id, name: account.name }))}
        outstanding={loan.outstanding}
      />
    </div>
  )
}

function TimelineRow({
  label,
  sub,
  amount,
  first,
  last,
  action,
}: {
  label: string
  sub?: string
  amount: string
  first?: boolean
  last?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-center">
        <span className={first ? 'h-2.5 w-2.5 rounded-full bg-slate-900 dark:bg-slate-100' : 'h-2.5 w-2.5 rounded-full bg-income'} />
        {!last && <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />}
      </div>
      <div className="flex flex-1 items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <span className={first || last ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}>{label}</span>
          {sub && <span className="text-xs text-slate-400 dark:text-slate-500">{sub}</span>}
        </span>
        <span className="flex items-center gap-3">
          {action}
          <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{amount}</span>
        </span>
      </div>
    </div>
  )
}

function PaymentModal({
  open,
  onClose,
  onSave,
  saving,
  accounts,
  outstanding,
}: {
  open: boolean
  onClose: () => void
  onSave: (body: { amount: number; paymentDate: string; accountId: string }) => Promise<unknown>
  saving: boolean
  accounts: { id: string; name: string }[]
  outstanding: number
}) {
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (Number(amount) > outstanding) {
      setError(`Payment exceeds the outstanding ${formatINR(outstanding)}.`)
      return
    }
    try {
      await onSave({ amount: Number(amount), paymentDate, accountId })
      setAmount('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Payment">
      <form onSubmit={submit} className="space-y-4">
        <Field label={`Amount (₹) — outstanding is ${formatINR(outstanding)}`}>
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
        </Field>
        <Field label="Date">
          <input required type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Account">
          <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  )
}
