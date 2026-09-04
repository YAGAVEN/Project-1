package org.finance.tracker.analytics;

import org.finance.tracker.account.AccountType;
import org.finance.tracker.common.PeriodType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Response shapes for /api/v1/analytics (backend.md §8.10) — every endpoint
 * returns `period` plus its series. Buckets are String labels: ISO dates for
 * daily/monthly buckets, "HH:00" for the hourly DAY view.
 */
public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    public record PeriodDto(PeriodType periodType, LocalDate startDate, LocalDate endDate) {
    }

    public record IncomeExpensePoint(String bucket, BigDecimal income, BigDecimal expense) {
    }

    public record IncomeExpenseResponse(PeriodDto period, List<IncomeExpensePoint> series) {
    }

    public record SpendingTrendPoint(String bucket, BigDecimal expense) {
    }

    public record SpendingTrendResponse(PeriodDto period, List<SpendingTrendPoint> series) {
    }

    public record CategorySlice(UUID categoryId, String name, BigDecimal amount, double percentage) {
    }

    public record ExpenseCategoriesResponse(PeriodDto period, BigDecimal totalExpense,
                                            List<CategorySlice> categories) {
    }

    public record SavingsPoint(String bucket, BigDecimal cumulative) {
    }

    /** goalId is null when the series covers all goals combined. */
    public record SavingsProgressResponse(PeriodDto period, UUID goalId, List<SavingsPoint> series) {
    }

    public record AccountCashflow(UUID accountId, String name, AccountType accountType,
                                  BigDecimal moneyIn, BigDecimal moneyOut) {
    }

    public record AccountCashflowResponse(PeriodDto period, List<AccountCashflow> accounts) {
    }
}
