package org.finance.tracker.dashboard;

import org.finance.tracker.account.AccountType;
import org.finance.tracker.budget.BudgetPeriodType;
import org.finance.tracker.budget.BudgetStatus;
import org.finance.tracker.common.PeriodType;
import org.finance.tracker.transaction.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * One aggregated response for the Dashboard page (backend.md §8.9) —
 * everything the page renders in a single call.
 */
public final class DashboardDtos {

    private DashboardDtos() {
    }

    public record PeriodDto(PeriodType periodType, LocalDate startDate, LocalDate endDate) {
    }

    /** totalBalance = net position: Σ derived balances over active accounts (§6.8). */
    public record Totals(BigDecimal totalBalance, BigDecimal income, BigDecimal expense, BigDecimal netCashFlow) {
    }

    /** DAY → hourly "HH:00" labels; WEEK/MONTH → daily; YEAR → monthly (§6.1). */
    public record SeriesPoint(String bucket, BigDecimal income, BigDecimal expense) {
    }

    public record CategorySlice(UUID categoryId, String name, BigDecimal amount, double percentage) {
    }

    public record BudgetWidget(
            UUID budgetId,
            String categoryName,
            BudgetPeriodType periodType,
            BigDecimal amountLimit,
            BigDecimal used,
            BigDecimal remaining,
            double percentageUsed,
            BudgetStatus status) {
    }

    public record AccountBalanceWidget(UUID accountId, String name, AccountType accountType, BigDecimal balance) {
    }

    public record CreditCardWidget(UUID accountId, BigDecimal outstanding, BigDecimal availableCredit,
                                   BigDecimal monthSpend) {
    }

    /** Loans module arrives in P4 — zeros until then. */
    public record LoansSummary(BigDecimal totalReceivable, BigDecimal totalPayable) {
    }

    public record RecentTransaction(
            UUID id,
            String description,
            String categoryName,
            String accountName,
            String counterAccountName,
            LocalDate transactionDate,
            BigDecimal amount,
            TransactionType transactionType) {
    }

    public record DashboardResponse(
            PeriodDto period,
            Totals totals,
            List<SeriesPoint> incomeExpenseSeries,
            List<CategorySlice> expenseByCategory,
            List<BudgetWidget> budgets,
            List<AccountBalanceWidget> accountBalances,
            List<CreditCardWidget> creditCards,
            LoansSummary loansSummary,
            List<RecentTransaction> recentTransactions) {
    }
}
