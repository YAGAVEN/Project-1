import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useOutboxFlusher, usePendingTransactions } from '../lib/outbox'
import { ServerWakingOverlay } from './ServerWakingOverlay'
import { TransactionDrawerProvider, useTransactionDrawer } from './TransactionDrawer'
import { BrandLogo } from './BrandLogo'
import { ThemeToggle } from './ThemeToggle'
import { Modal, cx, primaryButtonClass } from './ui'

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

/** The five mobile tabs; the rest live in the "More" sheet. */
const TAB_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/transactions', label: 'Txns', icon: 'list' },
  { to: '/accounts', label: 'Accounts', icon: 'card' },
  { to: '/analytics', label: 'Stats', icon: 'chart' },
] as const

const MORE_ITEMS = NAV_ITEMS.filter((item) => !TAB_ITEMS.some((tab) => tab.to === item.to))

const TAB_ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="m3 10.5 9-7.5 9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.8" />
    </>
  ),
  list: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20v-9" />
      <path d="M12 20V4" />
      <path d="M19 20v-6" />
    </>
  ),
}

export function AppShell() {
  const { session, signOut } = useAuth()
  const pendingCount = usePendingTransactions().length

  // Drains queued offline transactions once the backend answers.
  useOutboxFlusher(session?.user.id ?? null)

  return (
    <TransactionDrawerProvider>
      <div className="flex h-dvh flex-col bg-slate-50 dark:bg-slate-950">
        {/* Mobile top bar — brand + theme; everything else lives in the tab bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 md:hidden">
          <BrandLogo />
          <ThemeToggle className="shrink-0" />
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
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
                        ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )
                  }
                >
                  {item.label}
                  {item.to === '/transactions' && pendingCount > 0 && (
                    <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      {pendingCount} pending
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="space-y-2 border-t border-slate-200 px-3 py-4 dark:border-slate-800">
              <AddTransactionButton />
              <div className="flex items-center justify-between gap-2 px-3 pt-1">
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{session?.user.email}</div>
                <ThemeToggle className="shrink-0" />
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </aside>

          {/* min-w-0 keeps wide charts/tables from blowing out the flex row;
              bottom padding clears the fixed tab bar + FAB on mobile */}
          <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:p-8 md:pb-8">
            <Outlet />
          </main>
        </div>

        <MobileTabBar pendingCount={pendingCount} />
        <MobileFab />
        <ServerWakingOverlay />
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

const tabIconClass = 'h-5 w-5'

/** Bottom tab bar + "More" sheet, mobile only (md:hidden). */
function MobileTabBar({ pendingCount }: { pendingCount: number }) {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden"
      >
        {TAB_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cx(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )
            }
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={tabIconClass}
              aria-hidden="true"
            >
              {TAB_ICONS[item.icon]}
            </svg>
            {item.label}
            {item.to === '/transactions' && pendingCount > 0 && (
              <span className="absolute left-[calc(50%+6px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-expense px-1 text-[9px] font-semibold text-white">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            className={tabIconClass}
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
          More
        </button>
      </nav>

      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}

/** Remaining nav items + account actions, presented as a bottom sheet. */
function MobileMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, signOut } = useAuth()

  return (
    <Modal open={open} onClose={onClose} title="More">
      <nav className="space-y-1">
        {MORE_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              cx(
                'block rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="truncate px-3 text-xs text-slate-500 dark:text-slate-400">{session?.user.email}</div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          Logout
        </button>
      </div>
    </Modal>
  )
}

/** Floating quick-add button, mobile only — mirrors the sidebar CTA. */
function MobileFab() {
  const drawer = useTransactionDrawer()
  return (
    <button
      type="button"
      onClick={drawer.openCreate}
      aria-label="Add transaction"
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/40 transition-transform active:scale-95 md:hidden"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    </button>
  )
}
