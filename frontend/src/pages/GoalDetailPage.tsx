import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  errorMessage,
  useAccounts,
  useAddContribution,
  useCreateTransaction,
  useDeleteContribution,
  useDeleteGoal,
  useGoalDetail,
  useUpdateGoal,
} from '../lib/queries'
import { formatBucket, formatDateLabel, formatINR, todayISO } from '../lib/format'
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Spinner,
  StatCard,
  cx,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui'

export function GoalDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: goal, isLoading } = useGoalDetail(id)
  const addContribution = useAddContribution(id ?? '')
  const deleteContribution = useDeleteContribution(id ?? '')
  const updateGoal = useUpdateGoal(id ?? '')
  const deleteGoal = useDeleteGoal(id ?? '')
  const createTransaction = useCreateTransaction()
  const { data: accounts = [] } = useAccounts()

  const [contributeOpen, setContributeOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading || !goal) return <Spinner label="Loading goal…" />

  async function remove() {
    // §18 — with contributions this cancels; without them it hard-deletes
    await deleteGoal.mutateAsync()
    navigate('/savings')
  }

  return (
    <div className="space-y-6">
      <PageHeader title={goal.name}>
        <div className="flex items-center gap-2">
          <Link to="/savings" className={secondaryButtonClass}>← Savings</Link>
          <button type="button" onClick={() => setEditOpen(true)} className={secondaryButtonClass}>Edit</button>
          {confirmDelete ? (
            <button type="button" onClick={remove} className={dangerButtonClass}>Confirm</button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={dangerButtonClass}>Delete</button>
          )}
        </div>
      </PageHeader>
      {confirmDelete && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Goals with contributions are cancelled (history kept), not deleted.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Progress" value={formatINR(goal.progress)} tone="positive" hint={`${goal.percentage}% of target`} />
        <StatCard label="Target" value={formatINR(goal.targetAmount)} hint={goal.targetDate ? `by ${goal.targetDate}` : 'No deadline'} />
        <StatCard label="Status" value={goal.status} tone={goal.status === 'COMPLETED' ? 'positive' : 'default'} />
      </div>

      <Card className="space-y-2">
        <ProgressBar percentage={goal.percentage} />
        <div className="text-xs text-slate-500">{goal.contributions.length} contributions</div>
      </Card>

      <Card>
        <SectionTitle>Progress over time</SectionTitle>
        {goal.progressSeries.length === 0 ? (
          <EmptyState>No contributions yet.</EmptyState>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={goal.progressSeries} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatBucket} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tickFormatter={(value: number) => formatINR(value)} tick={{ fontSize: 11 }} stroke="#94a3b8" width={70} />
                <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="progress" stroke="#00b386" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle action={<button type="button" onClick={() => setContributeOpen(true)} className={primaryButtonClass}>+ Add Contribution</button>}>
          Contributions
        </SectionTitle>
        {goal.contributions.length === 0 ? (
          <EmptyState>Nothing contributed yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {goal.contributions.map((contribution) => (
              <li key={contribution.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-medium tabular-nums text-emerald-600">+{formatINR(contribution.amount)}</span>
                  {contribution.transactionId && <Badge tone="blue">linked transfer</Badge>}
                  {contribution.notes && <span className="truncate text-slate-500">{contribution.notes}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-slate-400">{formatDateLabel(contribution.contributionDate)}</span>
                  <button
                    type="button"
                    onClick={() => void deleteContribution.mutateAsync(contribution.id)}
                    className="text-xs text-rose-500 hover:underline"
                  >
                    remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ContributeModal
        open={contributeOpen}
        onClose={() => setContributeOpen(false)}
        onSave={async (body, transferBody) => {
          // §16 — "money actually moved" records a real TRANSFER first, then links it
          if (transferBody) {
            const transfer = await createTransaction.mutateAsync({
              transactionType: 'TRANSFER',
              amount: transferBody.amount,
              fromAccountId: transferBody.fromAccountId,
              toAccountId: transferBody.toAccountId,
              description: `Transfer for ${goal.name}`,
              transactionDate: body.contributionDate,
            })
            await addContribution.mutateAsync({ ...body, transactionId: transfer.id })
          } else {
            await addContribution.mutateAsync(body)
          }
        }}
        saving={addContribution.isPending || createTransaction.isPending}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
      />

      <EditGoalModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={updateGoal.mutateAsync}
        saving={updateGoal.isPending}
        goal={goal}
      />
    </div>
  )
}

function ContributeModal({
  open,
  onClose,
  onSave,
  saving,
  accounts,
}: {
  open: boolean
  onClose: () => void
  onSave: (body: { amount: number; contributionDate: string; notes: string | null }, transferBody?: { amount: number; fromAccountId: string; toAccountId: string }) => Promise<unknown>
  saving: boolean
  accounts: { id: string; name: string }[]
}) {
  const [amount, setAmount] = useState('')
  const [contributionDate, setContributionDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [moneyMoved, setMoneyMoved] = useState(false)
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const body = {
      amount: Number(amount),
      contributionDate,
      notes: notes || null,
    }
    try {
      if (moneyMoved) {
        if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
          setError('Pick two different accounts for the transfer.')
          return
        }
        await onSave(body, { amount: body.amount, fromAccountId, toAccountId })
      } else {
        await onSave(body)
      }
      setAmount('')
      setNotes('')
      setMoneyMoved(false)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Contribution">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount (₹)">
          <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
        </Field>
        <Field label="Date">
          <input required type="date" value={contributionDate} onChange={(event) => setContributionDate(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Notes">
          <input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="Optional" />
        </Field>

        <label className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={moneyMoved}
            onChange={(event) => setMoneyMoved(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>
            <span className="font-medium">Money actually moved?</span>
            <span className="block text-xs text-slate-500">
              Checked: also records a TRANSFER between accounts. Unchecked: pure allocation — no account changes.
            </span>
          </span>
        </label>

        {moneyMoved && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From account">
              <select required value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} className={inputClass}>
                <option value="">Select</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
            <Field label="To account">
              <select required value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} className={inputClass}>
                <option value="">Select</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Saving…' : 'Add contribution'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditGoalModal({
  open,
  onClose,
  onSave,
  saving,
  goal,
}: {
  open: boolean
  onClose: () => void
  onSave: (body: { name?: string; targetAmount?: number; targetDate?: string | null; description?: string | null; status?: 'ACTIVE' | 'CANCELLED' }) => Promise<unknown>
  saving: boolean
  goal: { name: string; targetAmount: number; targetDate: string | null; description: string | null; status: string }
}) {
  const [name, setName] = useState(goal.name)
  const [targetAmount, setTargetAmount] = useState(String(goal.targetAmount))
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
  const [status, setStatus] = useState(goal.status)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await onSave({
        name,
        targetAmount: Number(targetAmount),
        targetDate: targetDate || null,
        description: goal.description,
        status: status === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE',
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Goal">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Target amount (₹)">
          <input required type="number" min="0.01" step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
        </Field>
        <Field label="Target date">
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
