import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage, useAccounts, useCreateGoal, useGoals } from '../lib/queries'
import { formatINR } from '../lib/format'
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

export function SavingsPage() {
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts()
  const { data: goals = [], isLoading: goalsLoading } = useGoals()
  const createGoal = useCreateGoal()
  const [modalOpen, setModalOpen] = useState(false)

  const liquid = accounts
    .filter((account) => account.accountType === 'BANK' || account.accountType === 'CASH')
    .reduce((sum, account) => sum + account.balance, 0)
  const investments = accounts
    .filter((account) => account.accountType === 'INVESTMENT')
    .reduce((sum, account) => sum + account.balance, 0)
  const goalsAllocation = goals
    .filter((goal) => goal.status === 'ACTIVE')
    .reduce((sum, goal) => sum + goal.progress, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Savings & Goals">
        <button type="button" onClick={() => setModalOpen(true)} className={primaryButtonClass}>+ New Goal</button>
      </PageHeader>

      {/* §16 rendering rule: allocation is a label on the same money — never summed with cash */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Liquid Cash" value={formatINR(liquid)} hint="Bank + cash accounts" />
        <StatCard label="Investments" value={formatINR(investments)} hint="Investment accounts" />
        <StatCard label="Goals Allocation" value={formatINR(goalsAllocation)} hint="A label on money you already have — not extra" />
      </div>

      {goalsLoading || accountsLoading ? (
        <Spinner />
      ) : goals.length === 0 ? (
        <EmptyState>No goals yet — name something you're saving for.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals.map((goal) => (
            <Link key={goal.id} to={`/savings/${goal.id}`} className="block">
              <Card className="space-y-2 transition-colors hover:border-slate-300 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{goal.name}</span>
                  <Badge tone={goal.status === 'COMPLETED' ? 'green' : goal.status === 'CANCELLED' ? 'gray' : 'blue'}>
                    {goal.status}
                  </Badge>
                </div>
                <ProgressBar percentage={goal.percentage} />
                <div className="flex items-center justify-between text-xs tabular-nums text-slate-500">
                  <span>{formatINR(goal.progress)} of {formatINR(goal.targetAmount)} · {goal.percentage}%</span>
                  {goal.targetDate && <span>by {goal.targetDate}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewGoalModal open={modalOpen} onClose={() => setModalOpen(false)} onCreate={createGoal.mutateAsync} creating={createGoal.isPending} />
    </div>
  )
}

function NewGoalModal({
  open,
  onClose,
  onCreate,
  creating,
}: {
  open: boolean
  onClose: () => void
  onCreate: (body: { name: string; targetAmount: number; targetDate?: string | null; description?: string | null }) => Promise<unknown>
  creating: boolean
}) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await onCreate({
        name,
        targetAmount: Number(targetAmount),
        targetDate: targetDate || null,
        description: description || null,
      })
      setName('')
      setTargetAmount('')
      setTargetDate('')
      setDescription('')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Goal">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="e.g. Emergency Fund" />
        </Field>
        <Field label="Target amount (₹)">
          <input required type="number" min="0.01" step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} className={cx(inputClass, 'tabular-nums')} />
        </Field>
        <Field label="Target date (optional)">
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Description">
          <input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} placeholder="Optional" />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={creating} className={primaryButtonClass}>{creating ? 'Creating…' : 'Create goal'}</button>
        </div>
      </form>
    </Modal>
  )
}
