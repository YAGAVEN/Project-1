package org.finance.tracker.analytics;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.common.PeriodResolver;
import org.finance.tracker.common.PeriodType;
import org.finance.tracker.goal.GoalContributionRepository;
import org.finance.tracker.goal.GoalRepository;
import org.finance.tracker.goal.SavingsGoal;
import org.finance.tracker.transaction.Transaction;
import org.finance.tracker.transaction.TransactionRepository;
import org.finance.tracker.transaction.TransactionType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Timeseries aggregations for the Analytics page (backend.md §8.10).
 * Read-only like the dashboard; depends on transaction/account/goal modules.
 */
@Service
@RequiredArgsConstructor
public class AnalyticsService {

    private static final Set<TransactionType> INCOME_EXPENSE = Set.of(TransactionType.INCOME, TransactionType.EXPENSE);

    private final TransactionRepository transactionRepository;
    private final GoalRepository goalRepository;
    private final GoalContributionRepository contributionRepository;
    private final AccountRepository accountRepository;
    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public AnalyticsDtos.IncomeExpenseResponse incomeExpense(UUID userId, PeriodType periodType, LocalDate date) {
        Window window = resolve(periodType, date);
        return new AnalyticsDtos.IncomeExpenseResponse(window.periodDto(), incomeExpenseSeries(userId, window));
    }

    @Transactional(readOnly = true)
    public AnalyticsDtos.SpendingTrendResponse spendingTrend(UUID userId, PeriodType periodType, LocalDate date) {
        Window window = resolve(periodType, date);
        List<AnalyticsDtos.SpendingTrendPoint> series = incomeExpenseSeries(userId, window).stream()
                .map(point -> new AnalyticsDtos.SpendingTrendPoint(point.bucket(), point.expense()))
                .toList();
        return new AnalyticsDtos.SpendingTrendResponse(window.periodDto(), series);
    }

    /** Serves both the donut and the comparison bar (§8.10) — sorted desc, percentages of the total. */
    @Transactional(readOnly = true)
    public AnalyticsDtos.ExpenseCategoriesResponse expenseCategories(UUID userId, PeriodType periodType, LocalDate date) {
        Window window = resolve(periodType, date);
        List<Object[]> rows = transactionRepository.totalsByCategory(userId, TransactionType.EXPENSE,
                window.start(), window.endExclusive());

        BigDecimal totalExpense = BigDecimal.ZERO;
        Set<UUID> categoryIds = new HashSet<>();
        for (Object[] row : rows) {
            totalExpense = totalExpense.add((BigDecimal) row[1]);
            if (row[0] != null) {
                categoryIds.add((UUID) row[0]);
            }
        }
        Map<UUID, String> names = categoryNames(categoryIds);

        List<AnalyticsDtos.CategorySlice> slices = new ArrayList<>();
        for (Object[] row : rows) {
            if (row[0] == null) {
                continue;
            }
            BigDecimal amount = (BigDecimal) row[1];
            double percentage = totalExpense.signum() == 0
                    ? 0.0
                    : Math.round(amount.doubleValue() * 1000.0 / totalExpense.doubleValue()) / 10.0;
            slices.add(new AnalyticsDtos.CategorySlice((UUID) row[0],
                    names.getOrDefault((UUID) row[0], ""), amount, percentage));
        }
        slices.sort((a, b) -> b.amount().compareTo(a.amount()));
        return new AnalyticsDtos.ExpenseCategoriesResponse(window.periodDto(), totalExpense, slices);
    }

    /**
     * §8.10 — cumulative contributions per bucket. The line starts from
     * everything contributed BEFORE the window, so it is true progress-over-time.
     * ?goalId= focuses one goal; without it, all the user's goals combined.
     */
    @Transactional(readOnly = true)
    public AnalyticsDtos.SavingsProgressResponse savingsProgress(UUID userId, PeriodType periodType, LocalDate date,
                                                                 UUID goalId) {
        Window window = resolve(periodType, date);
        List<UUID> goalIds;
        if (goalId != null) {
            goalRepository.findByIdAndUserId(goalId, userId)
                    .orElseThrow(() -> NotFoundException.resource("Goal"));
            goalIds = List.of(goalId);
        } else {
            goalIds = goalRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .map(SavingsGoal::getId)
                    .toList();
        }

        BigDecimal base = goalIds.isEmpty()
                ? BigDecimal.ZERO
                : contributionRepository.sumBefore(goalIds, window.start());
        Map<LocalDate, BigDecimal> byDay = new HashMap<>();
        if (!goalIds.isEmpty()) {
            for (Object[] row : contributionRepository.dailyTotals(goalIds, window.start(), window.endExclusive())) {
                byDay.merge((LocalDate) row[0], (BigDecimal) row[1], BigDecimal::add);
            }
        }

        List<AnalyticsDtos.SavingsPoint> series = new ArrayList<>();
        BigDecimal running = base;
        for (PeriodResolver.Period bucket : PeriodResolver.buckets(window.type(), window.period())) {
            for (LocalDate day = bucket.startDate(); !day.isAfter(bucket.endDate()); day = day.plusDays(1)) {
                running = running.add(byDay.getOrDefault(day, BigDecimal.ZERO));
            }
            series.add(new AnalyticsDtos.SavingsPoint(bucket.startDate().toString(), running));
        }
        return new AnalyticsDtos.SavingsProgressResponse(window.periodDto(), goalId, series);
    }

    /** §8.10 — per active account: moneyIn / moneyOut for the window. */
    @Transactional(readOnly = true)
    public AnalyticsDtos.AccountCashflowResponse accountCashflow(UUID userId, PeriodType periodType, LocalDate date) {
        Window window = resolve(periodType, date);
        List<Account> accounts = accountRepository.findByUserIdAndIsActiveTrueOrderByNameAsc(userId);
        Map<UUID, BigDecimal> inflow = toAmountMap(transactionRepository.inflowByAccount(userId, window.start(), window.endExclusive()));
        Map<UUID, BigDecimal> outflow = toAmountMap(transactionRepository.outflowByAccount(userId, window.start(), window.endExclusive()));

        List<AnalyticsDtos.AccountCashflow> rows = accounts.stream()
                .map(account -> new AnalyticsDtos.AccountCashflow(
                        account.getId(),
                        account.getName(),
                        account.getAccountType(),
                        inflow.getOrDefault(account.getId(), BigDecimal.ZERO),
                        outflow.getOrDefault(account.getId(), BigDecimal.ZERO)))
                .toList();
        return new AnalyticsDtos.AccountCashflowResponse(window.periodDto(), rows);
    }

    // ---- helpers -------------------------------------------------------------

    private record Window(PeriodType type, PeriodResolver.Period period) {
        LocalDate start() {
            return period.startDate();
        }

        LocalDate endExclusive() {
            return period.endDate().plusDays(1);
        }

        AnalyticsDtos.PeriodDto periodDto() {
            return new AnalyticsDtos.PeriodDto(type, period.startDate(), period.endDate());
        }
    }

    private Window resolve(PeriodType periodType, LocalDate date) {
        PeriodType type = periodType == null ? PeriodType.MONTH : periodType;
        return new Window(type, PeriodResolver.resolve(type, date));
    }

    /** §6.1 granularity: DAY → hourly, WEEK/MONTH → daily, YEAR → monthly. */
    private List<AnalyticsDtos.IncomeExpensePoint> incomeExpenseSeries(UUID userId, Window window) {
        List<AnalyticsDtos.IncomeExpensePoint> points = new ArrayList<>();

        if (window.type() == PeriodType.DAY) {
            BigDecimal[] income = filledZeros(24);
            BigDecimal[] expense = filledZeros(24);
            for (Transaction t : transactionRepository.findInWindow(userId, INCOME_EXPENSE,
                    window.start(), window.endExclusive())) {
                int hour = t.getTransactionTime() == null ? 0 : t.getTransactionTime().getHour();
                if (t.getTransactionType() == TransactionType.INCOME) {
                    income[hour] = income[hour].add(t.getAmount());
                } else {
                    expense[hour] = expense[hour].add(t.getAmount());
                }
            }
            for (int hour = 0; hour < 24; hour++) {
                points.add(new AnalyticsDtos.IncomeExpensePoint(
                        String.format(Locale.ROOT, "%02d:00", hour), income[hour], expense[hour]));
            }
            return points;
        }

        Map<LocalDate, BigDecimal[]> byDay = new HashMap<>();
        for (Object[] row : transactionRepository.dailyTotalsByType(userId, INCOME_EXPENSE,
                window.start(), window.endExclusive())) {
            BigDecimal[] pair = byDay.computeIfAbsent((LocalDate) row[0],
                    k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            if (row[1] == TransactionType.INCOME) {
                pair[0] = pair[0].add((BigDecimal) row[2]);
            } else {
                pair[1] = pair[1].add((BigDecimal) row[2]);
            }
        }

        for (PeriodResolver.Period bucket : PeriodResolver.buckets(window.type(), window.period())) {
            BigDecimal bucketIncome = BigDecimal.ZERO;
            BigDecimal bucketExpense = BigDecimal.ZERO;
            for (LocalDate day = bucket.startDate(); !day.isAfter(bucket.endDate()); day = day.plusDays(1)) {
                BigDecimal[] pair = byDay.get(day);
                if (pair != null) {
                    bucketIncome = bucketIncome.add(pair[0]);
                    bucketExpense = bucketExpense.add(pair[1]);
                }
            }
            points.add(new AnalyticsDtos.IncomeExpensePoint(bucket.startDate().toString(), bucketIncome, bucketExpense));
        }
        return points;
    }

    private Map<UUID, BigDecimal> toAmountMap(List<Object[]> rows) {
        Map<UUID, BigDecimal> map = new HashMap<>();
        for (Object[] row : rows) {
            if (row[0] != null) {
                map.put((UUID) row[0], (BigDecimal) row[1]);
            }
        }
        return map;
    }

    private Map<UUID, String> categoryNames(Set<UUID> ids) {
        Map<UUID, String> names = new HashMap<>();
        if (!ids.isEmpty()) {
            for (Category category : categoryRepository.findAllById(ids)) {
                names.put(category.getId(), category.getName());
            }
        }
        return names;
    }

    private BigDecimal[] filledZeros(int size) {
        BigDecimal[] array = new BigDecimal[size];
        for (int i = 0; i < size; i++) {
            array[i] = BigDecimal.ZERO;
        }
        return array;
    }
}
