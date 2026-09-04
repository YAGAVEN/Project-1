package org.finance.tracker.analytics;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.finance.tracker.common.PeriodType;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/** /api/v1/analytics (backend.md §8.10) — all endpoints take ?periodType=&date=. */
@RestController
@RequestMapping("/api/v1/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final CurrentUser currentUser;

    @GetMapping("/income-expense")
    AnalyticsDtos.IncomeExpenseResponse incomeExpense(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return analyticsService.incomeExpense(currentUser.requireUserId(), periodType, date);
    }

    @GetMapping("/spending-trend")
    AnalyticsDtos.SpendingTrendResponse spendingTrend(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return analyticsService.spendingTrend(currentUser.requireUserId(), periodType, date);
    }

    @GetMapping("/expense-categories")
    AnalyticsDtos.ExpenseCategoriesResponse expenseCategories(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return analyticsService.expenseCategories(currentUser.requireUserId(), periodType, date);
    }

    @GetMapping("/savings-progress")
    AnalyticsDtos.SavingsProgressResponse savingsProgress(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) UUID goalId) {
        return analyticsService.savingsProgress(currentUser.requireUserId(), periodType, date, goalId);
    }

    @GetMapping("/account-cashflow")
    AnalyticsDtos.AccountCashflowResponse accountCashflow(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return analyticsService.accountCashflow(currentUser.requireUserId(), periodType, date);
    }
}
