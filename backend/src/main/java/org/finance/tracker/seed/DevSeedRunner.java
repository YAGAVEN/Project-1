package org.finance.tracker.seed;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.finance.tracker.account.AccountDtos;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.budget.BudgetDtos;
import org.finance.tracker.budget.BudgetPeriodType;
import org.finance.tracker.budget.BudgetService;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.category.CategoryType;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.contact.ContactDtos;
import org.finance.tracker.contact.ContactService;
import org.finance.tracker.goal.GoalDtos;
import org.finance.tracker.goal.GoalService;
import org.finance.tracker.loan.LoanDtos;
import org.finance.tracker.loan.LoanService;
import org.finance.tracker.loan.LoanType;
import org.finance.tracker.profile.ProfileService;
import org.finance.tracker.transaction.TransactionDtos;
import org.finance.tracker.transaction.TransactionService;
import org.finance.tracker.transaction.TransactionType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * dev-profile seeder (backend.md §11) — so the dashboard renders on day one:
 * two accounts + a card, transactions across two months, one budget, one loan
 * pair with a payment, one goal with contributions.
 *
 * Activate with SPRING_PROFILES_ACTIVE=dev and SEED_USER_ID=<the UUID of a REAL
 * Supabase user (Dashboard → Authentication → Users)> — profiles.id is a FK to
 * auth.users, so a made-up UUID cannot be seeded. A bad or missing id never
 * kills the app: seeding is skipped with a log message.
 */
@Component
@Profile("dev")
@RequiredArgsConstructor
@Slf4j
public class DevSeedRunner implements ApplicationRunner {

    private final ProfileService profileService;
    private final AccountService accountService;
    private final AccountRepository accountRepository;
    private final TransactionService transactionService;
    private final CategoryRepository categoryRepository;
    private final ContactService contactService;
    private final LoanService loanService;
    private final GoalService goalService;
    private final BudgetService budgetService;

    @Value("${app.seed.user-id:}")
    private String seedUserId;

    @Override
    public void run(ApplicationArguments args) {
        if (seedUserId == null || seedUserId.isBlank()) {
            log.info("dev seeder: SEED_USER_ID not set — skipping (backend starts without demo data)");
            return;
        }

        UUID userId;
        try {
            userId = UUID.fromString(seedUserId.trim());
        } catch (IllegalArgumentException ex) {
            log.error("dev seeder: SEED_USER_ID='{}' is not a valid UUID — skipping. "
                    + "Copy the UID from Supabase → Authentication → Users.", seedUserId);
            return;
        }

        if (!accountRepository.findByUserIdAndIsActiveTrueOrderByNameAsc(userId).isEmpty()) {
            log.info("dev seeder: user {} already has accounts — skipping", userId);
            return;
        }

        try {
            seed(userId);
        } catch (Exception ex) {
            // most commonly: profiles_id_fkey — the UUID is not a real auth.users row
            log.error("dev seeder failed — starting WITHOUT demo data. Make sure SEED_USER_ID is the "
                    + "UUID of a real Supabase user (Dashboard → Authentication → Users).", ex);
        }
    }

    private void seed(UUID userId) {
        // Provisioning creates the profile + default categories the names below rely on
        profileService.ensureProfile(userId, "Dev User");

        LocalDate today = LocalDate.now();
        LocalDate lastMonth = today.minusMonths(1);

        AccountDtos.AccountResponse bank = accountService.create(userId,
                new AccountDtos.CreateAccountRequest("HDFC Bank", AccountType.BANK,
                        new BigDecimal("85000.00"), null, null, null));
        AccountDtos.AccountResponse cash = accountService.create(userId,
                new AccountDtos.CreateAccountRequest("Cash Wallet", AccountType.CASH,
                        new BigDecimal("4500.00"), null, null, null));
        accountService.create(userId,
                new AccountDtos.CreateAccountRequest("HDFC Card", AccountType.CREDIT_CARD,
                        BigDecimal.ZERO, new BigDecimal("100000.00"), (short) 5, (short) 23));

        Category food = category(userId, CategoryType.EXPENSE, "Food");
        Category transport = category(userId, CategoryType.EXPENSE, "Transport");
        Category shopping = category(userId, CategoryType.EXPENSE, "Shopping");
        Category bills = category(userId, CategoryType.EXPENSE, "Bills");
        Category entertainment = category(userId, CategoryType.EXPENSE, "Entertainment");
        Category salary = category(userId, CategoryType.INCOME, "Salary");

        // ---- last month
        income(userId, bank, salary, new BigDecimal("92000.00"), lastMonth.withDayOfMonth(1), "Salary");
        expense(userId, bank, food, new BigDecimal("3200.00"), clamp(lastMonth, 8), "Groceries");
        expense(userId, cash, transport, new BigDecimal("800.00"), clamp(lastMonth, 12), "Auto fares");
        expense(userId, bank, shopping, new BigDecimal("5400.00"), clamp(lastMonth, 20), "Clothes");

        // ---- this month
        income(userId, bank, salary, new BigDecimal("92000.00"), clamp(today, 1), "Salary");
        expense(userId, bank, food, new BigDecimal("2850.00"), clamp(today, 3), "Groceries");
        expense(userId, bank, bills, new BigDecimal("2400.00"), clamp(today, 5), "Electricity");
        expense(userId, bank, entertainment, new BigDecimal("1100.00"), clamp(today, 6), "Movies");
        expense(userId, bank, food, new BigDecimal("3800.00"), clamp(today, 7), "Weekend outing");
        transfer(userId, bank, cash, new BigDecimal("10000.00"), clamp(today, 4), "Cash withdrawal");

        budgetService.create(userId,
                new BudgetDtos.CreateBudgetRequest(food.getId(), new BigDecimal("8000.00"),
                        BudgetPeriodType.MONTHLY));

        // ---- loan pair: lent Arun 5000 (2,000 back), borrowed 15,000
        var contact = contactService.create(userId, new ContactDtos.CreateContactRequest("Arun", "College friend"));
        var lent = loanService.create(userId, new LoanDtos.CreateLoanRequest(
                contact.getId(), LoanType.LENT, new BigDecimal("5000.00"),
                clamp(lastMonth, 15), cash.id(), "Lent for his laptop"));
        loanService.recordPayment(userId, lent.id(), new LoanDtos.CreatePaymentRequest(
                new BigDecimal("2000.00"), clamp(today, 6), bank.id()));
        loanService.create(userId, new LoanDtos.CreateLoanRequest(
                contact.getId(), LoanType.BORROWED, new BigDecimal("15000.00"),
                clamp(lastMonth, 18), bank.id(), "Borrowed for emergencies"));

        // ---- goal
        var goal = goalService.create(userId,
                new GoalDtos.CreateGoalRequest("Emergency Fund", new BigDecimal("300000.00"), null, "Six months of costs"));
        goalService.addContribution(userId, goal.id(), new GoalDtos.AddContributionRequest(
                new BigDecimal("40000.00"), clamp(lastMonth, 25), null, null));
        goalService.addContribution(userId, goal.id(), new GoalDtos.AddContributionRequest(
                new BigDecimal("15000.00"), clamp(today, 2), null, null));

        log.info("dev seeder: seeded accounts, transactions across two months, one budget, "
                + "one loan pair, one goal for user {}", userId);
    }

    private Category category(UUID userId, CategoryType type, String name) {
        return categoryRepository.findByUserIdAndCategoryTypeAndNameIgnoreCase(userId, type, name)
                .orElseThrow(() -> NotFoundException.resource("Category '" + name + "'"));
    }

    private void income(UUID userId, AccountDtos.AccountResponse to, Category category,
                        BigDecimal amount, LocalDate date, String description) {
        transactionService.create(userId, new TransactionDtos.CreateTransactionRequest(
                TransactionType.INCOME, amount, null, to.id(), category.getId(), description, date, null));
    }

    private void expense(UUID userId, AccountDtos.AccountResponse from, Category category,
                         BigDecimal amount, LocalDate date, String description) {
        transactionService.create(userId, new TransactionDtos.CreateTransactionRequest(
                TransactionType.EXPENSE, amount, from.id(), null, category.getId(), description, date, null));
    }

    private void transfer(UUID userId, AccountDtos.AccountResponse from, AccountDtos.AccountResponse to,
                          BigDecimal amount, LocalDate date, String description) {
        transactionService.create(userId, new TransactionDtos.CreateTransactionRequest(
                TransactionType.TRANSFER, amount, from.id(), to.id(), null, description, date, null));
    }

    /** Keeps seeded this-month dates inside the current month (no accidental spill into last month). */
    private LocalDate clamp(LocalDate anchor, int dayOfMonth) {
        LocalDate monthStart = anchor.withDayOfMonth(1);
        LocalDate wanted = anchor.withDayOfMonth(Math.min(dayOfMonth, anchor.lengthOfMonth()));
        return wanted.isBefore(monthStart) ? monthStart : wanted;
    }
}
