import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { AccountsPage } from './pages/AccountsPage'
import { AccountDetailPage } from './pages/AccountDetailPage'
import { BudgetsPage } from './pages/BudgetsPage'
import { BudgetDetailPage } from './pages/BudgetDetailPage'
import { SavingsPage } from './pages/SavingsPage'
import { GoalDetailPage } from './pages/GoalDetailPage'
import { LoansPage } from './pages/LoansPage'
import { LoanDetailPage } from './pages/LoanDetailPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Loading…</div>
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:id" element={<AccountDetailPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/budgets/:id" element={<BudgetDetailPage />} />
        <Route path="/savings" element={<SavingsPage />} />
        <Route path="/savings/:id" element={<GoalDetailPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/loans/:id" element={<LoanDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
