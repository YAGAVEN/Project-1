package org.finance.tracker.dashboard;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountDtos;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.budget.BudgetDtos;
import org.finance.tracker.budget.BudgetService;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.common.PeriodResolver;
import org.finance.tracker.common.PeriodType;
import org.finance.tracker.loan.LoanDtos;
import org.finance.tracker.loan.LoanService;
import org.finance.tracker.transaction.Transaction;
import org.finance.tracker.transaction.TransactionRepository;
import org.finance.tracker.transaction.TransactionType;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Read-only aggregator for the Dashboard page (backend.md §8.9). Depends on
 * account/budget services + transaction/category repositories — never the
 * reverse (backend.md §2.4 dependency rules).
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private static final Set<TransactionType> INCOME_EXPENSE = Set.of(TransactionType.INCOME, TransactionType.EXPENSE);
    private static final int RECENT_LIMIT = 10;

    private final AccountService accountService;
    private final AccountRepository accountRepository;
    private final BudgetService budgetService;
    private final LoanService loanService;
    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public DashboardDtos.DashboardResponse dashboard(UUID userId, PeriodType periodType, LocalDate date) {
        LocalDate anchor = date == null ? LocalDate.now(PeriodResolver.ZONE) : date;
        PeriodType windowType = periodType == null ? PeriodType.MONTH : periodType;
        PeriodResolver.Period window = PeriodResolver.resolve(windowType, anchor);
        LocalDate start = window.startDate();
        LocalDate endExclusive = window.endDate().plusDays(1);

        List<AccountDtos.AccountResponse> accounts = accountService.list(userId);

        BigDecimal income = transactionRepository.sumAmountByTypeInWindow(userId, TransactionType.INCOME, start, endExclusive);
        BigDecimal expense = transactionRepository.sumAmountByTypeInWindow(userId, TransactionType.EXPENSE, start, endExclusive);
        BigDecimal totalBalance = accounts.stream()
                .map(AccountDtos.AccountResponse::balance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<BudgetDtos.UsageItem> budgetUsage = budgetService.listUsage(userId, anchor);
        List<Transaction> recent = transactionRepository.recentForUser(userId, PageRequest.of(0, RECENT_LIMIT));

        return new DashboardDtos.DashboardResponse(
                new DashboardDtos.PeriodDto(windowType, start, window.endDate()),
                new DashboardDtos.Totals(totalBalance, income, expense, income.subtract(expense)),
                buildSeries(userId, windowType, window),
                expenseByCategory(userId, expense, start, endExclusive),
                budgetUsage.stream().map(this::toBudgetWidget).toList(),
                accounts.stream().map(this::toAccountWidget).toList(),
                creditCards(userId, accounts, anchor),
                toLoansSummary(userId),
                toRecentTransactions(recent));
    }

    /** Series granularity (§6.1): DAY → hourly, WEEK/MONTH → daily, YEAR → monthly. */
    private List<DashboardDtos.SeriesPoint> buildSeries(UUID userId, PeriodType windowType,
                                                        PeriodResolver.Period window) {
        LocalDate start = window.startDate();
        LocalDate endExclusive = window.endDate().plusDays(1);
        List<DashboardDtos.SeriesPoint> points = new ArrayList<>();

        if (windowType == PeriodType.DAY) {
            BigDecimal[] income = filledZeros(24);
            BigDecimal[] expense = filledZeros(24);
            for (Transaction t : transactionRepository.findInWindow(userId, INCOME_EXPENSE, start, endExclusive)) {
                int hour = t.getTransactionTime() == null ? 0 : t.getTransactionTime().getHour();
                if (t.getTransactionType() == TransactionType.INCOME) {
                    income[hour] = income[hour].add(t.getAmount());
                } else {
                    expense[hour] = expense[hour].add(t.getAmount());
                }
            }
            for (int hour = 0; hour < 24; hour++) {
                points.add(new DashboardDtos.SeriesPoint(String.format("%02d:00", hour), income[hour], expense[hour]));
            }
            return points;
        }

        Map<LocalDate, BigDecimal[]> byDay = dailyTotals(userId, start, endExclusive);
        if (windowType == PeriodType.YEAR) {
            YearMonth month = YearMonth.from(start);
            for (int i = 0; i < 12; i++) {
                BigDecimal monthIncome = BigDecimal.ZERO;
                BigDecimal monthExpense = BigDecimal.ZERO;
                for (LocalDate day = month.atDay(1); !day.isAfter(month.atEndOfMonth()); day = day.plusDays(1)) {
                    BigDecimal[] pair = byDay.get(day);
                    if (pair != null) {
                        monthIncome = monthIncome.add(pair[0]);
                        monthExpense = monthExpense.add(pair[1]);
                    }
                }
                // bucket label = month start, matching the §8.9 example ("2026-09-01")
                points.add(new DashboardDtos.SeriesPoint(month.atDay(1).toString(), monthIncome, monthExpense));
                month = month.plusMonths(1);
            }
        } else {
            for (LocalDate day = start; !day.isAfter(window.endDate()); day = day.plusDays(1)) {
                BigDecimal[] pair = byDay.getOrDefault(day, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                points.add(new DashboardDtos.SeriesPoint(day.toString(), pair[0], pair[1]));
            }
        }
        return points;
    }

    private Map<LocalDate, BigDecimal[]> dailyTotals(UUID userId, LocalDate start, LocalDate endExclusive) {
        Map<LocalDate, BigDecimal[]> byDay = new HashMap<>();
        for (Object[] row : transactionRepository.dailyTotalsByType(userId, INCOME_EXPENSE, start, endExclusive)) {
            LocalDate day = (LocalDate) row[0];
            BigDecimal[] pair = byDay.computeIfAbsent(day, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            if (row[1] == TransactionType.INCOME) {
                pair[0] = pair[0].add((BigDecimal) row[2]);
            } else {
                pair[1] = pair[1].add((BigDecimal) row[2]);
            }
        }
        return byDay;
    }

    private List<DashboardDtos.CategorySlice> expenseByCategory(UUID userId, BigDecimal totalExpense,
                                                                LocalDate start, LocalDate endExclusive) {
        List<Object[]> rows = transactionRepository.totalsByCategory(userId, TransactionType.EXPENSE, start, endExclusive);
        Set<UUID> categoryIds = new HashSet<>();
        for (Object[] row : rows) {
            if (row[0] != null) {
                categoryIds.add((UUID) row[0]);
            }
        }
        Map<UUID, String> names = categoryNames(categoryIds);

        List<DashboardDtos.CategorySlice> slices = new ArrayList<>();
        for (Object[] row : rows) {
            if (row[0] == null) {
                continue; // EXPENSE validation requires a category, so this cannot normally happen
            }
            BigDecimal amount = (BigDecimal) row[1];
            double percentage = totalExpense.signum() == 0
                    ? 0.0
                    : round1(amount.doubleValue() * 100.0 / totalExpense.doubleValue());
            slices.add(new DashboardDtos.CategorySlice((UUID) row[0],
                    names.getOrDefault((UUID) row[0], ""), amount, percentage));
        }
        slices.sort((a, b) -> b.amount().compareTo(a.amount())); // sorted desc per §8.10
        return slices;
    }

    /** §6.4 — outstanding, availableCredit; monthSpend over the calendar month of the anchor. */
    private List<DashboardDtos.CreditCardWidget> creditCards(UUID userId,
                                                             List<AccountDtos.AccountResponse> accounts,
                                                             LocalDate anchor) {
        LocalDate monthStart = anchor.withDayOfMonth(1);
        LocalDate monthEndExclusive = monthStart.plusMonths(1);

        List<DashboardDtos.CreditCardWidget> cards = new ArrayList<>();
        for (AccountDtos.AccountResponse account : accounts) {
            if (account.accountType() != AccountType.CREDIT_CARD) {
                continue;
            }
            BigDecimal outstanding = account.balance().negate().max(BigDecimal.ZERO);
            BigDecimal availableCredit = account.creditLimit() == null
                    ? null
                    : account.creditLimit().subtract(outstanding);
            BigDecimal monthSpend = transactionRepository.sumByFromAccountInWindow(
                    account.id(), TransactionType.EXPENSE, monthStart, monthEndExclusive);
            cards.add(new DashboardDtos.CreditCardWidget(account.id(), outstanding, availableCredit, monthSpend));
        }
        return cards;
    }

    private List<DashboardDtos.RecentTransaction> toRecentTransactions(List<Transaction> recent) {
        Set<UUID> categoryIds = new HashSet<>();
        Set<UUID> accountIds = new HashSet<>();
        for (Transaction t : recent) {
            if (t.getCategoryId() != null) {
                categoryIds.add(t.getCategoryId());
            }
            if (t.getFromAccountId() != null) {
                accountIds.add(t.getFromAccountId());
            }
            if (t.getToAccountId() != null) {
                accountIds.add(t.getToAccountId());
            }
        }
        Map<UUID, String> categoryNames = categoryNames(categoryIds);
        Map<UUID, String> accountNames = new HashMap<>();
        for (Account account : accountRepository.findAllById(accountIds)) {
            accountNames.put(account.getId(), account.getName());
        }

        return recent.stream().map(t -> {
            // primary account: where the money landed (INCOME) or left from (EXPENSE/TRANSFER)
            UUID primary = t.getTransactionType() == TransactionType.INCOME
                    ? t.getToAccountId()
                    : t.getFromAccountId();
            UUID counter = primary != null && primary.equals(t.getFromAccountId()) ? t.getToAccountId() : null;
            return new DashboardDtos.RecentTransaction(
                    t.getId(),
                    t.getDescription(),
                    t.getCategoryId() == null ? null : categoryNames.get(t.getCategoryId()),
                    primary == null ? null : accountNames.get(primary),
                    counter == null ? null : accountNames.get(counter),
                    t.getTransactionDate(),
                    t.getAmount(),
                    t.getTransactionType());
        }).toList();
    }

    /** §6.6 — "You'll get ₹X" / "You owe ₹Y": outstanding of ACTIVE loans by direction. */
    private DashboardDtos.LoansSummary toLoansSummary(UUID userId) {
        LoanDtos.PortfolioTotals totals = loanService.portfolioTotals(userId);
        return new DashboardDtos.LoansSummary(totals.totalReceivable(), totals.totalPayable());
    }

    private DashboardDtos.BudgetWidget toBudgetWidget(BudgetDtos.UsageItem item) {        return new DashboardDtos.BudgetWidget(
                item.budgetId(),
                item.categoryName(),
                item.periodType(),
                item.amountLimit(),
                item.used(),
                item.remaining(),
                item.percentageUsed(),
                item.status());
    }

    private DashboardDtos.AccountBalanceWidget toAccountWidget(AccountDtos.AccountResponse account) {
        return new DashboardDtos.AccountBalanceWidget(
                account.id(),
                account.name(),
                account.accountType(),
                account.balance());
    }

    private BigDecimal[] filledZeros(int size) {
        BigDecimal[] array = new BigDecimal[size];
        for (int i = 0; i < size; i++) {
            array[i] = BigDecimal.ZERO;
        }
        return array;
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

    private double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}
