package org.finance.tracker.budget;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.category.CategoryService;
import org.finance.tracker.category.CategoryType;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.common.PageResponse;
import org.finance.tracker.common.PeriodResolver;
import org.finance.tracker.transaction.TransactionDtos;
import org.finance.tracker.transaction.TransactionRepository;
import org.finance.tracker.transaction.TransactionService;
import org.finance.tracker.transaction.TransactionType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Budget templates + the usage engine (backend.md §6.5, §8.6). Usage is
 * derived per viewed period — every "used" number is a live Σ EXPENSE query,
 * never a stored value (plan invariant 5/6).
 */
@Service
@RequiredArgsConstructor
public class BudgetService {

    private static final int MAX_HISTORY_PERIODS = 24;
    private static final int DRILL_DOWN_LIMIT = 100;

    private final BudgetRepository budgetRepository;
    private final CategoryService categoryService;
    private final CategoryRepository categoryRepository;
    private final TransactionRepository transactionRepository;
    private final TransactionService transactionService;

    @Transactional(readOnly = true)
    public BudgetDtos.BudgetListResponse list(UUID userId, LocalDate date) {
        LocalDate anchor = date == null ? LocalDate.now(PeriodResolver.ZONE) : date;
        List<BudgetDtos.UsageItem> items = listUsage(userId, anchor);

        BigDecimal totalBudget = BigDecimal.ZERO;
        BigDecimal totalSpent = BigDecimal.ZERO;
        for (BudgetDtos.UsageItem item : items) {
            totalBudget = totalBudget.add(item.amountLimit());
            totalSpent = totalSpent.add(item.used());
        }

        return new BudgetDtos.BudgetListResponse(anchor,
                new BudgetDtos.Totals(totalBudget, totalSpent, totalBudget.subtract(totalSpent)), items);
    }

    /** Reused by the dashboard widget (§8.9): every active template in its own current window. */
    @Transactional(readOnly = true)
    public List<BudgetDtos.UsageItem> listUsage(UUID userId, LocalDate anchor) {
        List<Budget> templates = budgetRepository.findByUserIdAndIsActiveTrueOrderByCreatedAtAsc(userId);
        Set<UUID> categoryIds = new HashSet<>();
        for (Budget budget : templates) {
            categoryIds.add(budget.getCategoryId());
        }
        Map<UUID, String> categoryNames = categoryNames(categoryIds);
        return templates.stream()
                .map(budget -> usageItem(userId, budget, anchor, categoryNames))
                .toList();
    }

    @Transactional
    public BudgetDtos.UsageItem create(UUID userId, BudgetDtos.CreateBudgetRequest request) {
        Category category = categoryService.getOwnedCategory(userId, request.categoryId());
        if (!category.isActive()) {
            throw new BadRequestException("Category '" + category.getName() + "' is deactivated");
        }
        if (category.getCategoryType() != CategoryType.EXPENSE) {
            // schema.md §7.3 — budgets apply to EXPENSE categories only
            throw new BadRequestException("Budgets apply to EXPENSE categories only");
        }
        if (budgetRepository.existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrue(
                userId, request.categoryId(), request.periodType())) {
            throw new ConflictException("An active " + request.periodType()
                    + " budget already exists for category " + category.getName());
        }

        Budget budget = new Budget();
        budget.setUserId(userId);
        budget.setCategoryId(request.categoryId());
        budget.setAmountLimit(request.amountLimit());
        budget.setPeriodType(request.periodType());
        budget.setActive(true);

        Budget saved = budgetRepository.save(budget);
        return usageItem(userId, saved, LocalDate.now(PeriodResolver.ZONE),
                categoryNames(Set.of(saved.getCategoryId())));
    }

    @Transactional
    public BudgetDtos.UsageItem update(UUID userId, UUID budgetId, BudgetDtos.UpdateBudgetRequest request) {
        Budget budget = findOwned(userId, budgetId);

        if (request.periodType() != null && request.periodType() != budget.getPeriodType()) {
            if (budgetRepository.existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrueAndIdNot(
                    userId, budget.getCategoryId(), request.periodType(), budgetId)) {
                throw new ConflictException("An active " + request.periodType() + " budget already exists for this category");
            }
            budget.setPeriodType(request.periodType());
        }
        if (request.amountLimit() != null) {
            budget.setAmountLimit(request.amountLimit());
        }
        if (request.isActive() != null) {
            budget.setActive(request.isActive());
        }

        Budget saved = budgetRepository.save(budget);
        return usageItem(userId, saved, LocalDate.now(PeriodResolver.ZONE),
                categoryNames(Set.of(saved.getCategoryId())));
    }

    /** schema.md §18 — hard delete always: usage is derived, nothing can orphan. */
    @Transactional
    public void delete(UUID userId, UUID budgetId) {
        Budget budget = findOwned(userId, budgetId);
        budgetRepository.delete(budget);
    }

    /** §8.6 drill-down — the EXPENSE transactions feeding this template's current window. */
    @Transactional(readOnly = true)
    public PageResponse<TransactionDtos.TransactionResponse> transactions(UUID userId, UUID budgetId, LocalDate date) {
        Budget budget = findOwned(userId, budgetId);
        LocalDate anchor = date == null ? LocalDate.now(PeriodResolver.ZONE) : date;
        PeriodResolver.Period window = PeriodResolver.resolve(budget.getPeriodType().toPeriodType(), anchor);
        return transactionService.list(userId, TransactionType.EXPENSE, budget.getCategoryId(), null,
                window.startDate(), window.endDate(), null, 0, DRILL_DOWN_LIMIT);
    }

    /** §8.6 history — N periods ending with the current one, chronological. */
    @Transactional(readOnly = true)
    public BudgetDtos.HistoryResponse history(UUID userId, UUID budgetId, int periods) {
        Budget budget = findOwned(userId, budgetId);
        LocalDate anchor = LocalDate.now(PeriodResolver.ZONE);
        int count = Math.min(Math.max(periods, 1), MAX_HISTORY_PERIODS);
        String categoryName = categoryNames(Set.of(budget.getCategoryId()))
                .getOrDefault(budget.getCategoryId(), "");

        List<BudgetDtos.HistoryPoint> points = new java.util.ArrayList<>();
        for (int i = count - 1; i >= 0; i--) {
            LocalDate pastAnchor = shift(budget.getPeriodType(), anchor, i);
            PeriodResolver.Period window = PeriodResolver.resolve(budget.getPeriodType().toPeriodType(), pastAnchor);
            BigDecimal used = transactionRepository.sumByCategoryInWindow(userId, TransactionType.EXPENSE,
                    budget.getCategoryId(), window.startDate(), window.endDate().plusDays(1));
            double percentage = percentageOf(budget, used);
            points.add(new BudgetDtos.HistoryPoint(window, used, percentage, BudgetStatus.of(percentage)));
        }

        return new BudgetDtos.HistoryResponse(budget.getId(), budget.getCategoryId(), categoryName,
                budget.getPeriodType(), budget.getAmountLimit(), points);
    }

    // ---- usage engine (§6.5) ----------------------------------------------

    private BudgetDtos.UsageItem usageItem(UUID userId, Budget budget, LocalDate anchor,
                                           Map<UUID, String> categoryNames) {
        PeriodResolver.Period window = PeriodResolver.resolve(budget.getPeriodType().toPeriodType(), anchor);
        BigDecimal used = transactionRepository.sumByCategoryInWindow(userId, TransactionType.EXPENSE,
                budget.getCategoryId(), window.startDate(), window.endDate().plusDays(1));
        BigDecimal remaining = budget.getAmountLimit().subtract(used);
        double percentage = percentageOf(budget, used);

        return new BudgetDtos.UsageItem(
                budget.getId(),
                budget.getCategoryId(),
                categoryNames.getOrDefault(budget.getCategoryId(), ""),
                budget.getPeriodType(),
                budget.getAmountLimit(),
                used,
                remaining,
                percentage,
                BudgetStatus.of(percentage),
                window);
    }

    private double percentageOf(Budget budget, BigDecimal used) {
        double percentage = used.doubleValue() * 100.0 / budget.getAmountLimit().doubleValue();
        return Math.round(percentage * 10.0) / 10.0;
    }

    /** i-th earlier period's anchor (i = 0 is the current one). */
    private LocalDate shift(BudgetPeriodType periodType, LocalDate anchor, int i) {
        return switch (periodType) {
            case WEEKLY -> anchor.minusWeeks(i);
            case MONTHLY -> anchor.minusMonths(i);
            case YEARLY -> anchor.minusYears(i);
        };
    }

    private Map<UUID, String> categoryNames(Set<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, String> names = new HashMap<>();
        for (Category category : categoryRepository.findAllById(ids)) {
            names.put(category.getId(), category.getName());
        }
        return names;
    }

    private Budget findOwned(UUID userId, UUID budgetId) {
        return budgetRepository.findByIdAndUserId(budgetId, userId)
                .orElseThrow(() -> NotFoundException.resource("Budget"));
    }
}
