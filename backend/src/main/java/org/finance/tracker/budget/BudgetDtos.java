package org.finance.tracker.budget;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.finance.tracker.common.PeriodResolver;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Request/response shapes for /api/v1/budgets (backend.md §8.6).
 * Usage items are the derived view — nothing here is stored (§6.5).
 */
public final class BudgetDtos {

    private BudgetDtos() {
    }

    public record CreateBudgetRequest(
            @NotNull UUID categoryId,
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amountLimit,
            @NotNull BudgetPeriodType periodType) {
    }

    /** PATCH-style PUT — limit / period / active; category is fixed after creation. */
    public record UpdateBudgetRequest(
            @Positive @Digits(integer = 12, fraction = 2) BigDecimal amountLimit,
            BudgetPeriodType periodType,
            Boolean isActive) {
    }

    /** Matches the §8.6 item shape, plus periodType. */
    public record UsageItem(
            UUID budgetId,
            UUID categoryId,
            String categoryName,
            BudgetPeriodType periodType,
            BigDecimal amountLimit,
            BigDecimal used,
            BigDecimal remaining,
            double percentageUsed,
            BudgetStatus status,
            PeriodResolver.Period window) {
    }

    public record Totals(BigDecimal totalBudget, BigDecimal totalSpent, BigDecimal totalRemaining) {
    }

    public record BudgetListResponse(LocalDate anchorDate, Totals totals, List<UsageItem> budgets) {
    }

    /** One historical period of the budget trend (§8.6 history). */
    public record HistoryPoint(
            PeriodResolver.Period window,
            BigDecimal used,
            double percentageUsed,
            BudgetStatus status) {
    }

    /** Chronological, oldest first, current period last. */
    public record HistoryResponse(
            UUID budgetId,
            UUID categoryId,
            String categoryName,
            BudgetPeriodType periodType,
            BigDecimal amountLimit,
            List<HistoryPoint> points) {
    }
}
