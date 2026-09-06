import { lazy, Suspense, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

/**
 * Route-level code splitting (production readiness): chart-heavy pages pull in
 * Recharts, so they load on demand instead of shipping with the first paint.
 * The pages use named exports, hence the `default` re-wrap. Login and the
 * reset landing stay eager — they are the logged-out first screen.
 */
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage as ComponentType })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage as ComponentType })))
const AccountsPage = lazy(() => import('./pages/AccountsPage').then((m) => ({ default: m.AccountsPage as ComponentType })))
const AccountDetailPage = lazy(() => import('./pages/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage as ComponentType })))
const BudgetsPage = lazy(() => import('./pages/BudgetsPage').then((m) => ({ default: m.BudgetsPage as ComponentType })))
const BudgetDetailPage = lazy(() => import('./pages/BudgetDetailPage').then((m) => ({ default: m.BudgetDetailPage as ComponentType })))
const SavingsPage = lazy(() => import('./pages/SavingsPage').then((m) => ({ default: m.SavingsPage as ComponentType })))
const GoalDetailPage = lazy(() => import('./pages/GoalDetailPage').then((m) => ({ default: m.GoalDetailPage as ComponentType })))
const LoansPage = lazy(() => import('./pages/LoansPage').then((m) => ({ default: m.LoansPage as ComponentType })))
const LoanDetailPage = lazy(() => import('./pages/LoanDetailPage').then((m) => ({ default: m.LoanDetailPage as ComponentType })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage as ComponentType })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage as ComponentType })))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400" role="status" aria-live="polite">
      Loading…
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <RouteFallback />
  }

  // Forgot-password landing (frontend.md §4). Matched BEFORE the session gate:
  // the recovery link's PKCE exchange creates a session, which would otherwise
  // drop the user straight into the app instead of the set-new-password form.
  if (location.pathname === '/reset-password') {
    return <ResetPasswordPage />
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Suspense fallback={<RouteFallback />}>
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
    </Suspense>
  )
}
