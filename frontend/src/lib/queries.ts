import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  Account,
  AccountBody,
  AccountCashflowResponse,
  AccountDetail,
  AccountUpdateBody,
  BudgetBody,
  BudgetHistory,
  BudgetListResponse,
  BudgetUpdateBody,
  Category,
  CategoryBody,
  CategoryUpdateBody,
  Contact,
  ContactBody,
  ContactSummary,
  ContributionBody,
  Dashboard,
  ExpenseCategoriesResponse,
  Goal,
  GoalBody,
  GoalDetail,
  GoalUpdateBody,
  IncomeExpenseResponse,
  Loan,
  LoanBody,
  LoanUpdateBody,
  PageResponse,
  PaymentBody,
  PeriodType,
  Profile,
  SavingsProgressResponse,
  SpendingTrendResponse,
  Transaction,
  TransactionBody,
  TransactionSummary,
} from './types'

/** Period selector state shared by Dashboard/Analytics (frontend.md §6). */
export interface Period {
  periodType: PeriodType
  date: string
}

export function periodParams(period: Period) {
  return { periodType: period.periodType, date: period.date }
}

function get<T>(url: string, params?: object): Promise<T> {
  return api.get<T>(url, { params }).then((response) => response.data)
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return api.post<T>(url, body).then((response) => response.data)
}

function put<T>(url: string, body?: unknown): Promise<T> {
  return api.put<T>(url, body).then((response) => response.data)
}

/** The backend's problem+json `detail` is the user-facing message. */
export function errorMessage(error: unknown): string {
  if (axiosish(error)) {
    const detail = (error.response?.data as { detail?: string } | undefined)?.detail
    if (detail) return detail
    if (error.response?.status === 409) return 'That conflicts with something that already exists.'
    if (error.response?.status === 404) return 'Not found.'
    return 'Something went wrong. Try again.'
  }
  return 'Something went wrong. Try again.'
}

function axiosish(error: unknown): error is { response?: { status?: number; data?: unknown } } {
  return typeof error === 'object' && error !== null && 'response' in error
}

/**
 * Every mutation invalidates the whole cache: balances, budgets and goal
 * progress are all derived, so almost anything can change after any write.
 */
function useInvalidatingMutation<TInput, TOutput>(mutationFn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}

// ---- dashboard ----

export function useDashboard(period: Period) {
  return useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => get<Dashboard>('/dashboard', periodParams(period)),
  })
}

// ---- accounts ----

export function useAccounts() {
  return useQuery({ queryKey: ['accounts'], queryFn: () => get<Account[]>('/accounts') })
}

export function useAccountDetail(id: string | undefined, period: Period) {
  return useQuery({
    queryKey: ['accounts', id, period],
    queryFn: () => get<AccountDetail>(`/accounts/${id}`, periodParams(period)),
    enabled: id !== undefined,
  })
}

export function useCreateAccount() {
  return useInvalidatingMutation((body: AccountBody) => post<Account>('/accounts', body))
}

export function useUpdateAccount(id: string) {
  return useInvalidatingMutation((body: AccountUpdateBody) => put<Account>(`/accounts/${id}`, body))
}

export function useDeleteAccount(id: string) {
  return useInvalidatingMutation(() => api.delete(`/accounts/${id}`))
}

// ---- transactions ----

export interface TransactionFilters {
  type?: string
  categoryId?: string
  accountId?: string
  from?: string
  to?: string
  q?: string
  page?: number
  size?: number
}

export function useTransactions(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => get<PageResponse<Transaction>>('/transactions', filters),
  })
}

export function useTransactionSummary(date: string) {
  return useQuery({
    queryKey: ['transactions', 'summary', date],
    queryFn: () => get<TransactionSummary>('/transactions/summary', { periodType: 'MONTH', date }),
  })
}

/** Full row for the drawer — the dashboard's recent list only carries a projection. */
export function fetchTransaction(id: string) {
  return get<Transaction>(`/transactions/${id}`)
}

export function useCreateTransaction() {
  return useInvalidatingMutation((body: TransactionBody) => post<Transaction>('/transactions', body))
}

export function useUpdateTransaction(id: string) {
  return useInvalidatingMutation((body: TransactionBody) => put<Transaction>(`/transactions/${id}`, body))
}

export function useDeleteTransaction(id: string) {
  return useInvalidatingMutation(() => api.delete(`/transactions/${id}`))
}

// ---- categories ----

export function useCategories(includeInactive = false) {
  return useQuery({
    queryKey: ['categories', includeInactive],
    queryFn: () => get<Category[]>('/categories', includeInactive ? { includeInactive: true } : undefined),
  })
}

export function useCreateCategory() {
  return useInvalidatingMutation((body: CategoryBody) => post<Category>('/categories', body))
}

/** Settings manages many categories — the id arrives per call. */
export function useUpdateCategory() {
  return useInvalidatingMutation(({ id, body }: { id: string; body: CategoryUpdateBody }) =>
    put<Category>(`/categories/${id}`, body),
  )
}

export function useDeleteCategory() {
  return useInvalidatingMutation((id: string) => api.delete(`/categories/${id}`))
}

// ---- budgets ----

export function useBudgets(date: string) {
  return useQuery({
    queryKey: ['budgets', date],
    queryFn: () => get<BudgetListResponse>('/budgets', { date }),
  })
}

export function useCreateBudget() {
  return useInvalidatingMutation((body: BudgetBody) => post('/budgets', body))
}

export function useUpdateBudget(id: string) {
  return useInvalidatingMutation((body: BudgetUpdateBody) => put(`/budgets/${id}`, body))
}

export function useDeleteBudget(id: string) {
  return useInvalidatingMutation(() => api.delete(`/budgets/${id}`))
}

export function useBudgetHistory(id: string | undefined, periods = 6) {
  return useQuery({
    queryKey: ['budgets', id, 'history', periods],
    queryFn: () => get<BudgetHistory>(`/budgets/${id}/history`, { periods }),
    enabled: id !== undefined,
  })
}

export function useBudgetTransactions(id: string | undefined, date: string) {
  return useQuery({
    queryKey: ['budgets', id, 'transactions', date],
    queryFn: () => get<PageResponse<Transaction>>(`/budgets/${id}/transactions`, { date }),
    enabled: id !== undefined,
  })
}

// ---- goals ----

export function useGoals(status?: string) {
  return useQuery({
    queryKey: ['goals', status ?? 'all'],
    queryFn: () => get<Goal[]>('/goals', status ? { status } : undefined),
  })
}

export function useGoalDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['goals', id],
    queryFn: () => get<GoalDetail>(`/goals/${id}`),
    enabled: id !== undefined,
  })
}

export function useCreateGoal() {
  return useInvalidatingMutation((body: GoalBody) => post<Goal>('/goals', body))
}

export function useUpdateGoal(id: string) {
  return useInvalidatingMutation((body: GoalUpdateBody) => put<Goal>(`/goals/${id}`, body))
}

export function useDeleteGoal(id: string) {
  return useInvalidatingMutation(() => api.delete(`/goals/${id}`))
}

export function useAddContribution(id: string) {
  return useInvalidatingMutation((body: ContributionBody) => post(`/goals/${id}/contributions`, body))
}

export function useDeleteContribution(goalId: string) {
  return useInvalidatingMutation((contributionId: string) =>
    api.delete(`/goals/${goalId}/contributions/${contributionId}`),
  )
}

// ---- loans & contacts ----

export function useLoans(direction?: string, status?: string) {
  return useQuery({
    queryKey: ['loans', direction ?? 'all', status ?? 'all'],
    queryFn: () => get<Loan[]>('/loans', { ...(direction ? { direction } : {}), ...(status ? { status } : {}) }),
  })
}

export function useLoanDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['loans', id],
    queryFn: () => get<Loan>(`/loans/${id}`),
    enabled: id !== undefined,
  })
}

export function useCreateLoan() {
  return useInvalidatingMutation((body: LoanBody) => post<Loan>('/loans', body))
}

export function useUpdateLoan(id: string) {
  return useInvalidatingMutation((body: LoanUpdateBody) => put<Loan>(`/loans/${id}`, body))
}

export function useDeleteLoan(id: string) {
  return useInvalidatingMutation(() => api.delete(`/loans/${id}`))
}

export function useRecordPayment(loanId: string) {
  return useInvalidatingMutation((body: PaymentBody) => post<Loan>(`/loans/${loanId}/payments`, body))
}

export function useDeletePayment(loanId: string) {
  return useInvalidatingMutation((paymentId: string) => api.delete(`/loans/${loanId}/payments/${paymentId}`))
}

export function useContacts() {
  return useQuery({ queryKey: ['contacts'], queryFn: () => get<Contact[]>('/contacts') })
}

export function useCreateContact() {
  return useInvalidatingMutation((body: ContactBody) => post<Contact>('/contacts', body))
}

export function useUpdateContact(id: string) {
  return useInvalidatingMutation((body: ContactBody) => put<Contact>(`/contacts/${id}`, body))
}

/** Settings manages many contacts — the id arrives per call. */
export function useDeleteContact() {
  return useInvalidatingMutation((id: string) => api.delete(`/contacts/${id}`))
}

export function useContactSummary(id: string | undefined) {
  return useQuery({
    queryKey: ['contacts', id, 'summary'],
    queryFn: () => get<ContactSummary>(`/contacts/${id}`),
    enabled: id !== undefined,
  })
}

// ---- analytics ----

export function useIncomeExpense(period: Period) {
  return useQuery({
    queryKey: ['analytics', 'income-expense', period],
    queryFn: () => get<IncomeExpenseResponse>('/analytics/income-expense', periodParams(period)),
  })
}

export function useSpendingTrend(period: Period) {
  return useQuery({
    queryKey: ['analytics', 'spending-trend', period],
    queryFn: () => get<SpendingTrendResponse>('/analytics/spending-trend', periodParams(period)),
  })
}

export function useExpenseCategories(period: Period) {
  return useQuery({
    queryKey: ['analytics', 'expense-categories', period],
    queryFn: () => get<ExpenseCategoriesResponse>('/analytics/expense-categories', periodParams(period)),
  })
}

export function useSavingsProgress(period: Period, goalId?: string) {
  return useQuery({
    queryKey: ['analytics', 'savings-progress', period, goalId ?? 'all'],
    queryFn: () => get<SavingsProgressResponse>('/analytics/savings-progress', {
      ...periodParams(period),
      ...(goalId ? { goalId } : {}),
    }),
  })
}

export function useAccountCashflow(period: Period) {
  return useQuery({
    queryKey: ['analytics', 'account-cashflow', period],
    queryFn: () => get<AccountCashflowResponse>('/analytics/account-cashflow', periodParams(period)),
  })
}

// ---- profile ----

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => get<Profile>('/me') })
}

export function useUpdateMe() {
  return useInvalidatingMutation((body: { fullName?: string | null; preferredCurrency?: string }) =>
    put<Profile>('/me', body),
  )
}
