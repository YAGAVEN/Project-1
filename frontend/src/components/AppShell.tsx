import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { TransactionDrawerProvider, useTransactionDrawer } from './TransactionDrawer'
import { BrandLogo } from './BrandLogo'
import { cx, primaryButtonClass } from './ui'

/** Persistent left sidebar per frontend.md §3. */
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/savings', label: 'Savings' },
  { to: '/loans', label: 'Loans' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/settings', label: 'Settings' },
] as const

export function AppShell() {
  const { session, signOut } = useAuth()

  return (
    <TransactionDrawerProvider>
      <div className="flex h-screen bg-slate-50">
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="px-5 py-5">
            <BrandLogo />
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cx(
                    'block rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-700 hover:bg-slate-100',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-2 border-t border-slate-200 px-3 py-4">
            <AddTransactionButton />
            <div className="truncate px-3 pt-1 text-xs text-slate-500">{session?.user.email}</div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </TransactionDrawerProvider>
  )
}

function AddTransactionButton() {
  const drawer = useTransactionDrawer()
  return (
    <button
      type="button"
      onClick={drawer.openCreate}
      className={cx('w-full', primaryButtonClass)}
    >
      + Add Transaction
    </button>
  )
}
