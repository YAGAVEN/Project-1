/** Mirrors the Spring API contract (backend.md §8) — one place, per module. */

export type PeriodType = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
export interface PeriodWindow {
  startDate: string
  endDate: string
}
export interface PeriodDto extends PeriodWindow {
  periodType: PeriodType
}

export type AccountType = 'BANK' | 'CASH' | 'CREDIT_CARD' | 'INVESTMENT'

export interface Account {
  id: string
  name: string
  accountType: AccountType
  balance: number
  openingBalance: number
  creditLimit: number | null
  billingDay: number | null
  paymentDueDay: number | null
  isActive: boolean
}

export interface CardMetrics {
  outstanding: number
  availableCredit: number | null
}

export interface AccountTransactionItem {
  id: string
  transactionType: string
  amount: number
  description: string | null
  transactionDate: string
  transactionTime: string | null
  categoryId: string | null
  categoryName: string | null
  counterAccountId: string | null
  counterAccountName: string | null
}

export interface AccountDetail {
  id: string
  name: string
  accountType: AccountType
  balance: number
  openingBalance: number
  creditLimit: number | null
  billingDay: number | null
  paymentDueDay: number | null
  isActive: boolean
  cardMetrics: CardMetrics | null
  moneyIn: number
  moneyOut: number
  balanceTrend: { bucket: string; closingBalance: number }[]
  recentTransactions: AccountTransactionItem[]
}

export type TransactionType =
  | 'INCOME'
  | 'EXPENSE'
  | 'TRANSFER'
  | 'LOAN_GIVEN'
  | 'LOAN_RECEIVED'
  | 'LOAN_REPAYMENT_IN'
  | 'LOAN_REPAYMENT_OUT'

export interface Transaction {
  id: string
  transactionType: TransactionType
  amount: number
  fromAccountId: string | null
  fromAccountName: string | null
  fromAccountBalance: number | null
  toAccountId: string | null
  toAccountName: string | null
  toAccountBalance: number | null
  categoryId: string | null
  categoryName: string | null
  description: string | null
  transactionDate: string
  transactionTime: string | null
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
}

export interface TransactionSummary {
  income: number
  expense: number
  netCashFlow: number
  count: number
  window: PeriodWindow
}

export type CategoryType = 'INCOME' | 'EXPENSE'

export interface Category {
  id: string
  name: string
  categoryType: CategoryType
  parentCategoryId: string | null
  isActive: boolean
}

export type BudgetPeriodType = 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type BudgetStatus = 'OK' | 'WARNING' | 'OVER'

export interface BudgetUsage {
  budgetId: string
  categoryId: string
  categoryName: string
  periodType: BudgetPeriodType
  amountLimit: number
  used: number
  remaining: number
  percentageUsed: number
  status: BudgetStatus
  window: PeriodWindow
}

export interface BudgetTotals {
  totalBudget: number
  totalSpent: number
  totalRemaining: number
}

export interface BudgetListResponse {
  anchorDate: string
  totals: BudgetTotals
  budgets: BudgetUsage[]
}

export interface BudgetHistoryPoint {
  window: PeriodWindow
  used: number
  percentageUsed: number
  status: BudgetStatus
}

export interface BudgetHistory {
  budgetId: string
  categoryId: string
  categoryName: string
  periodType: BudgetPeriodType
  amountLimit: number
  points: BudgetHistoryPoint[]
}

export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface Goal {
  id: string
  name: string
  targetAmount: number
  targetDate: string | null
  status: GoalStatus
  description: string | null
  progress: number
  percentage: number
  contributionCount: number
}

export interface Contribution {
  id: string
  amount: number
  contributionDate: string
  notes: string | null
  transactionId: string | null
}

export interface GoalDetail {
  id: string
  name: string
  targetAmount: number
  targetDate: string | null
  status: GoalStatus
  description: string | null
  progress: number
  percentage: number
  contributions: Contribution[]
  progressSeries: { date: string; progress: number }[]
}

export type LoanType = 'LENT' | 'BORROWED'
export type LoanStatus = 'ACTIVE' | 'PAID' | 'CANCELLED'

export interface LoanPayment {
  id: string
  amount: number
  paymentDate: string
  accountId: string | null
  accountName: string | null
  transactionId: string | null
}

export interface Loan {
  id: string
  contactId: string
  contactName: string
  loanType: LoanType
  status: LoanStatus
  originalAmount: number
  outstanding: number
  loanDate: string
  accountId: string | null
  accountName: string | null
  description: string | null
  payments: LoanPayment[] | null
}

export interface Contact {
  id: string
  name: string
  notes: string | null
}

export interface ContactSummary {
  contactId: string
  name: string
  totalLent: number
  totalReturned: number
  totalBorrowed: number
  totalRepaid: number
  netPending: number
}

export interface Dashboard {
  period: PeriodDto
  totals: { totalBalance: number; income: number; expense: number; netCashFlow: number }
  incomeExpenseSeries: { bucket: string; income: number; expense: number }[]
  expenseByCategory: { categoryId: string; name: string; amount: number; percentage: number }[]
  budgets: {
    budgetId: string
    categoryName: string
    periodType: BudgetPeriodType
    amountLimit: number
    used: number
    remaining: number
    percentageUsed: number
    status: BudgetStatus
  }[]
  accountBalances: { accountId: string; name: string; accountType: AccountType; balance: number }[]
  creditCards: { accountId: string; outstanding: number; availableCredit: number | null; monthSpend: number }[]
  loansSummary: { totalReceivable: number; totalPayable: number }
  recentTransactions: {
    id: string
    description: string | null
    categoryName: string | null
    accountName: string | null
    counterAccountName: string | null
    transactionDate: string
    amount: number
    transactionType: TransactionType
  }[]
}

// ---- analytics (§8.10) ----

export interface IncomeExpenseSeriesPoint {
  bucket: string
  income: number
  expense: number
}
export interface IncomeExpenseResponse {
  period: PeriodDto
  series: IncomeExpenseSeriesPoint[]
}
export interface SpendingTrendResponse {
  period: PeriodDto
  series: { bucket: string; expense: number }[]
}
export interface CategorySlice {
  categoryId: string
  name: string
  amount: number
  percentage: number
}
export interface ExpenseCategoriesResponse {
  period: PeriodDto
  totalExpense: number
  categories: CategorySlice[]
}
export interface SavingsProgressResponse {
  period: PeriodDto
  goalId: string | null
  series: { bucket: string; cumulative: number }[]
}
export interface AccountCashflow {
  accountId: string
  name: string
  accountType: AccountType
  moneyIn: number
  moneyOut: number
}
export interface AccountCashflowResponse {
  period: PeriodDto
  accounts: AccountCashflow[]
}

export interface Profile {
  id: string
  fullName: string | null
  preferredCurrency: string
}

// ---- request bodies ----

export interface AccountBody {
  name: string
  accountType: AccountType
  openingBalance: number
  creditLimit?: number | null
  billingDay?: number | null
  paymentDueDay?: number | null
}

export interface AccountUpdateBody {
  name?: string
  creditLimit?: number
  billingDay?: number
  paymentDueDay?: number
  isActive?: boolean
}

export interface TransactionBody {
  transactionType?: TransactionType
  amount: number
  fromAccountId?: string | null
  toAccountId?: string | null
  categoryId?: string | null
  description?: string | null
  transactionDate: string
  transactionTime?: string | null
}

export interface CategoryBody {
  name: string
  categoryType: CategoryType
  parentCategoryId?: string | null
}

export interface CategoryUpdateBody {
  name?: string
  isActive?: boolean
}

export interface BudgetBody {
  categoryId: string
  amountLimit: number
  periodType: BudgetPeriodType
}

export interface BudgetUpdateBody {
  amountLimit?: number
  periodType?: BudgetPeriodType
  isActive?: boolean
}

export interface GoalBody {
  name: string
  targetAmount: number
  targetDate?: string | null
  description?: string | null
}

export interface GoalUpdateBody {
  name?: string
  targetAmount?: number
  targetDate?: string | null
  description?: string | null
  status?: 'ACTIVE' | 'CANCELLED'
}

export interface ContributionBody {
  amount: number
  contributionDate: string
  notes?: string | null
  transactionId?: string | null
}

export interface LoanBody {
  contactId: string
  loanType: LoanType
  amount: number
  loanDate: string
  accountId: string
  description?: string | null
}

export interface LoanUpdateBody {
  contactId?: string
  description?: string | null
}

export interface PaymentBody {
  amount: number
  paymentDate: string
  accountId: string
}

export interface ContactBody {
  name: string
  notes?: string | null
}
