import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PeriodSelector } from '../components/PeriodSelector'
import { Card, EmptyState, PageHeader, SectionTitle, Spinner } from '../components/ui'
import { formatBucket, formatINR, formatINRCompact, todayISO } from '../lib/format'
import {
  useAccountCashflow,
  useExpenseCategories,
  useIncomeExpense,
  useSavingsProgress,
  useSpendingTrend,
  type Period,
} from '../lib/queries'

const DONUT_COLORS = ['#00b386', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#64748b']

const tooltipStyle = { borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }

export function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>({ periodType: 'MONTH', date: todayISO() })
  const incomeExpense = useIncomeExpense(period)
  const spendingTrend = useSpendingTrend(period)
  const categories = useExpenseCategories(period)
  const savings = useSavingsProgress(period)
  const cashflow = useAccountCashflow(period)

  const loading =
    incomeExpense.isLoading || spendingTrend.isLoading || categories.isLoading || savings.isLoading || cashflow.isLoading

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics">
        <PeriodSelector value={period} onChange={setPeriod} />
      </PageHeader>

      {loading ? <Spinner label="Crunching numbers…" /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* 1. Income vs Expense */}
          <ChartCard title="Income vs Expense" data={incomeExpense.data?.series}>
            <BarChart data={incomeExpense.data?.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} stroke="#94a3b8" width={64} />
              <Tooltip formatter={(value) => formatINR(Number(value))} labelFormatter={(label) => formatBucket(String(label))} contentStyle={tooltipStyle} />
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ChartCard>

          {/* 2. Spending trend */}
          <ChartCard title="Spending Trend" data={spendingTrend.data?.series}>
            <LineChart data={spendingTrend.data?.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} stroke="#94a3b8" width={64} />
              <Tooltip formatter={(value) => formatINR(Number(value))} labelFormatter={(label) => formatBucket(String(label))} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="expense" name="Expense" stroke="#f43f5e" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          {/* 3. Category donut */}
          <ChartCard title="Where Money Went" data={categories.data?.categories}>
            <PieChart>
              <Pie data={categories.data?.categories} dataKey="amount" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                {(categories.data?.categories ?? []).map((slice, index) => (
                  <Cell key={slice.categoryId} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ChartCard>

          {/* 4. Category comparison */}
          <ChartCard title="Category Comparison" data={categories.data?.categories}>
            <BarChart data={categories.data?.categories} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" width={90} />
              <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={tooltipStyle} />
              <Bar dataKey="amount" name="Spent" fill="#00b386" radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ChartCard>

          {/* 5. Savings progress */}
          <ChartCard title="Savings Progress" data={savings.data?.series}>
            <LineChart data={savings.data?.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={formatBucket} tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} stroke="#94a3b8" width={64} />
              <Tooltip formatter={(value) => formatINR(Number(value))} labelFormatter={(label) => formatBucket(String(label))} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="cumulative" name="Saved so far" stroke="#00b386" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>

          {/* 6. Account cashflow */}
          <ChartCard title="Account Cash Flow" data={cashflow.data?.accounts}>
            <BarChart data={cashflow.data?.accounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tickFormatter={formatINRCompact} tick={{ fontSize: 10 }} stroke="#94a3b8" width={64} />
              <Tooltip formatter={(value) => formatINR(Number(value))} contentStyle={tooltipStyle} />
              <Bar dataKey="moneyIn" name="In" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="moneyOut" name="Out" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function ChartCard({
  title,
  data,
  children,
}: {
  title: string
  data: unknown
  children: React.ReactNode
}) {
  const empty = !data || (Array.isArray(data) && data.length === 0)
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {empty ? (
        <EmptyState>Nothing in this period.</EmptyState>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
