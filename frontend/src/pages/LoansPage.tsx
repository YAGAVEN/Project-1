import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useAccounts, useContacts, useCreateContact, useCreateLoan, useLoans } from '../lib/queries'
import { formatINR } from '../lib/format'
import type { LoanType } from '../lib/types'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ProgressBar,
  Spinner,
  StatCard,
  cx,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

export function LoansPage() {
  const [tab, setTab] = useState<LoanType>('LENT')
  const { data: activeLoans = [], isLoading } = useLoans(undefined, 'ACTIVE')
  const [modalOpen, setModalOpen] = useState(false)

  const receivable = activeLoans
    .filter((loan) => loan.loanType === 'LENT')
    .reduce((sum, loan) => sum + loan.outstanding, 0)
  const payable = activeLoans
    .filter((loan) => loan.loanType === 'BORROWED')
    .reduce((sum, loan) => sum + loan.outstanding, 0)

  const visible = activeLoans.filter((loan) => loan.loanType === tab)

  return (
    <div className="space-y-6">
      <PageHeader title="Loans">
        <button type="button" onClick={() => setModalOpen(true)} className={primaryButtonClass}>+ Record Loan</button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="You'll get" value={formatINR(receivable)} tone="positive" hint="Outstanding on money you lent" />
        <StatCard label="You owe" value={formatINR(payable)} tone="negative" hint="Outstanding on money you borrowed" />
      </div>

      {/* §17 tabs */}
      <div className="flex w-fit rounded-xl bg-slate-100 p-1">
        {(['LENT', 'BORROWED'] as LoanType[]).map((direction) => (
          <button
            key={direction}
            type="button"
            onClick={() => setTab(direction)}
            className={cx(
              'rounded-lg px-4 py-2 text-sm font-medium',
              tab === direction ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            {direction === 'LENT' ? 'Money I Lent' : 'Money I Borrowed'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState>
          No active loans here. Money movements for loans are recorded automatically — never as manual expenses.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((loan) => {
            const isLent = loan.loanType === 'LENT'
            const paidBack = loan.originalAmount - loan.outstanding
            const settled = (paidBack / loan.originalAmount) * 100
            return (
              <Link key={loan.id} to={`/loans/${loan.id}`} className="block">
                <Card className="space-y-2 transition-colors hover:border-slate-300 hover:shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{loan.contactName}</span>
                    <Badge tone={loan.status === 'PAID' ? 'green' : 'blue'}>{loan.status === 'PAID' ? 'All settled' : 'Active'}</Badge>
                  </div>
                  <ProgressBar percentage={settled} />
                  <div className="flex items-center justify-between text-xs tabular-nums text-slate-500">
                    <span>
                      {isLent
                        ? `${formatINR(paidBack)} of ${formatINR(loan.originalAmount)} paid back to you`
                        : `You've paid back ${formatINR(paidBack)} of ${formatINR(loan.originalAmount)}`}
                    </span>
                    <span className={cx('font-medium', loan.outstanding > 0 ? 'text-slate-700' : 'text-emerald-600')}>
                      {loan.outstanding === 0
                        ? 'Nothing left'
                        : isLent
                          ? `${formatINR(loan.outstanding)} still to come to you`
                          : `${formatINR(loan.outstanding)} still owed by you`}
                    </span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <RecordLoanModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}

function RecordLoanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: contacts = [] } = useContacts()
  const { data: accounts = [] } = useAccounts()
  const createLoan = useCreateLoan()
  const createContact = useCreateContact()

  const [loanType, setLoanType] = useState<LoanType>('LENT')
  const [contactId, setContactId] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [amount, setAmount] = useState('')
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      let resolvedContactId = contactId
      if (newContactName) {
        const contact = await createContact.mutateAsync({ name: newContactName })
        resolvedContactId = contact.id
      }
      if (!resolvedContactId) {
        setError('Pick a contact or enter a new name.')
        return
      }
      await createLoan.mutateAsync({
        contactId: resolvedContactId,
        loanType,
        amount: Number(amount),
        loanDate,
        accountId,
        description: description || null,
      })
      setContactId('')
      setNewContactName('')
      setAmount('')
      setDescription('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const spendable = accounts.filter((account) => account.isActive && account.accountType !== 'CREDIT_CARD')

  return (
    <Modal open={open} onClose={onClose} title="Record Loan" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['LENT', 'BORROWED'] as LoanType[]).map((direction) => (
            <button
              key={direction}
              type="button"
              onClick={() => setLoanType(direction)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-medium',
                loanType === direction ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
              )}
            >
              {direction === 'LENT' ? 'I gave money' : 'I received money'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact">
            <select value={contactId} onChange={(event) => { setContactId(event.target.value); setNewContactName('') }} className={inputClass}>
              <option value="">Select existing</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.name}</option>
              ))}
            </select>
          </Field>
          <Field label="…or create new">
            <input
              maxLength={120}
              value={newContactName}
              onChange={(event) => { setNewContactName(event.target.value); if (event.target.value) setContactId('') }}
              className={inputClass}
              placeholder="New contact name"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₹) — immutable afterwards">
            <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
          </Field>
          <Field label="Loan date">
            <input required type="date" value={loanDate} onChange={(event) => setLoanDate(event.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field label={loanType === 'LENT' ? 'Money left this account' : 'Money entered this account'}>
          <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} className={inputClass}>
            <option value="">Select account</option>
            {spendable.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Description">
          <input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} placeholder="Optional" />
        </Field>

        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Creating the loan records the matching money movement automatically — don't also log it as an expense or income.
        </p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={createLoan.isPending || createContact.isPending} className={primaryButtonClass}>
            {createLoan.isPending ? 'Saving…' : 'Record loan'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
