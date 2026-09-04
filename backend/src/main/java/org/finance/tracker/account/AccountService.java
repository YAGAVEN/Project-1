package org.finance.tracker.account;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.common.PeriodResolver;
import org.finance.tracker.common.PeriodType;
import org.finance.tracker.transaction.Transaction;
import org.finance.tracker.transaction.TransactionRepository;
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
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccountService {

    private static final int RECENT_TRANSACTION_LIMIT = 10;

    private final AccountRepository accountRepository;
    // Direct repository reuse (not TransactionService) keeps the dependency
    // graph acyclic: TransactionService already depends on AccountService.
    private final TransactionRepository transactionRepository;
    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public List<AccountDtos.AccountResponse> list(UUID userId) {
        return accountRepository.findByUserIdAndIsActiveTrueOrderByNameAsc(userId).stream()
                .map(account -> toResponse(account, balanceOf(account)))
                .toList();
    }

    @Transactional
    public AccountDtos.AccountResponse create(UUID userId, AccountDtos.CreateAccountRequest request) {
        if (request.accountType() == AccountType.CREDIT_CARD && request.creditLimit() == null) {
            throw new BadRequestException("creditLimit is required for a CREDIT_CARD account");
        }

        Account account = new Account();
        account.setUserId(userId);
        account.setName(request.name());
        account.setAccountType(request.accountType());
        account.setOpeningBalance(request.openingBalance());
        if (request.accountType() == AccountType.CREDIT_CARD) {
            // credit fields are CREDIT_CARD-only columns (schema.md §6)
            account.setCreditLimit(request.creditLimit());
            account.setBillingDay(request.billingDay());
            account.setPaymentDueDay(request.paymentDueDay());
        }

        Account saved = accountRepository.save(account);
        return toResponse(saved, balanceOf(saved));
    }

    @Transactional(readOnly = true)
    public AccountDtos.AccountDetailResponse getDetail(UUID userId, UUID accountId,
                                                       PeriodType periodType, LocalDate date) {
        Account account = findOwned(userId, accountId);
        BigDecimal balance = balanceOf(account);
        PeriodType windowType = periodType == null ? PeriodType.MONTH : periodType;
        PeriodResolver.Period window = PeriodResolver.resolve(windowType, date);
        LocalDate start = window.startDate();
        LocalDate endExclusive = window.endDate().plusDays(1);

        List<Transaction> recent = transactionRepository.recentForAccount(
                account.getId(), PageRequest.of(0, RECENT_TRANSACTION_LIMIT));

        List<Object[]> inOut = transactionRepository.moneyInOut(account.getId(), start, endExclusive);
        BigDecimal moneyIn = BigDecimal.ZERO;
        BigDecimal moneyOut = BigDecimal.ZERO;
        if (!inOut.isEmpty() && inOut.get(0) != null) {
            moneyIn = (BigDecimal) inOut.get(0)[0];
            moneyOut = (BigDecimal) inOut.get(0)[1];
        }

        return new AccountDtos.AccountDetailResponse(
                account.getId(),
                account.getName(),
                account.getAccountType(),
                balance,
                account.getOpeningBalance(),
                account.getCreditLimit(),
                account.getBillingDay(),
                account.getPaymentDueDay(),
                account.isActive(),
                cardMetrics(account, balance),
                moneyIn,
                moneyOut,
                balanceTrend(account, windowType, window),
                toTransactionItems(account.getId(), recent));
    }

    @Transactional
    public AccountDtos.AccountResponse update(UUID userId, UUID accountId, AccountDtos.UpdateAccountRequest request) {
        Account account = findOwned(userId, accountId);

        if (request.name() != null) {
            account.setName(request.name());
        }
        if (account.getAccountType() == AccountType.CREDIT_CARD) {
            if (request.creditLimit() != null) {
                account.setCreditLimit(request.creditLimit());
            }
            if (request.billingDay() != null) {
                account.setBillingDay(request.billingDay());
            }
            if (request.paymentDueDay() != null) {
                account.setPaymentDueDay(request.paymentDueDay());
            }
        }
        if (request.isActive() != null) {
            account.setActive(request.isActive());
        }

        Account saved = accountRepository.save(account);
        return toResponse(saved, balanceOf(saved));
    }

    /**
     * schema.md §18 — deactivate when transactions reference the account
     * (from OR to side), hard delete only when nothing references it.
     */
    @Transactional
    public void delete(UUID userId, UUID accountId) {
        Account account = findOwned(userId, accountId);
        if (transactionRepository.existsReferencingAccount(account.getId())) {
            account.setActive(false);
            accountRepository.save(account);
        } else {
            accountRepository.delete(account);
        }
    }

    /** Scoped lookup: another user's id must look like a missing one (404, never 403). */
    public Account getOwnedAccount(UUID userId, UUID accountId) {
        return findOwned(userId, accountId);
    }

    /** backend.md §6.2 — opening + Σ(in) − Σ(out); one formula for every account type. */
    public BigDecimal currentBalance(Account account) {
        return balanceOf(account);
    }

    private Account findOwned(UUID userId, UUID accountId) {
        return accountRepository.findByIdAndUserId(accountId, userId)
                .orElseThrow(() -> NotFoundException.resource("Account"));
    }

    private AccountDtos.CardMetrics cardMetrics(Account account, BigDecimal balance) {
        if (account.getAccountType() != AccountType.CREDIT_CARD) {
            return null;
        }
        // backend.md §6.4 — a card balance is negative or zero; outstanding is its positive form
        BigDecimal outstanding = balance.negate().max(BigDecimal.ZERO);
        BigDecimal availableCredit = account.getCreditLimit() == null
                ? null
                : account.getCreditLimit().subtract(outstanding);
        return new AccountDtos.CardMetrics(outstanding, availableCredit);
    }

    /** Closing balance per bucket: monthly buckets for YEAR, daily otherwise (backend.md §8.3). */
    private List<AccountDtos.TrendPoint> balanceTrend(Account account, PeriodType windowType,
                                                      PeriodResolver.Period window) {
        LocalDate start = window.startDate();
        LocalDate endExclusive = window.endDate().plusDays(1);

        Map<LocalDate, BigDecimal> netByDay = new HashMap<>();
        for (Object[] row : transactionRepository.netFlowByDay(account.getId(), start, endExclusive)) {
            netByDay.put((LocalDate) row[0], (BigDecimal) row[1]);
        }

        BigDecimal running = account.getOpeningBalance()
                .add(transactionRepository.netFlowBefore(account.getId(), start));

        List<AccountDtos.TrendPoint> trend = new ArrayList<>();
        for (LocalDate[] bucket : buckets(windowType, window)) {
            for (LocalDate day = bucket[0]; !day.isAfter(bucket[1]); day = day.plusDays(1)) {
                running = running.add(netByDay.getOrDefault(day, BigDecimal.ZERO));
            }
            trend.add(new AccountDtos.TrendPoint(bucket[1], running));
        }
        return trend;
    }

    private List<LocalDate[]> buckets(PeriodType windowType, PeriodResolver.Period window) {
        List<LocalDate[]> result = new ArrayList<>();
        if (windowType == PeriodType.YEAR) {
            YearMonth month = YearMonth.from(window.startDate());
            for (int i = 0; i < 12; i++) {
                result.add(new LocalDate[]{month.atDay(1), month.atEndOfMonth()});
                month = month.plusMonths(1);
            }
        } else {
            for (LocalDate day = window.startDate(); !day.isAfter(window.endDate()); day = day.plusDays(1)) {
                result.add(new LocalDate[]{day, day});
            }
        }
        return result;
    }

    private List<AccountDtos.TransactionItem> toTransactionItems(UUID accountId, List<Transaction> txns) {
        Set<UUID> counterIds = new HashSet<>();
        Set<UUID> categoryIds = new HashSet<>();
        for (Transaction t : txns) {
            UUID counter = accountId.equals(t.getFromAccountId()) ? t.getToAccountId() : t.getFromAccountId();
            if (counter != null) {
                counterIds.add(counter);
            }
            if (t.getCategoryId() != null) {
                categoryIds.add(t.getCategoryId());
            }
        }

        Map<UUID, String> accountNames = counterIds.isEmpty() ? Map.of()
                : accountRepository.findAllById(counterIds).stream()
                        .collect(Collectors.toMap(Account::getId, Account::getName));
        Map<UUID, String> categoryNames = categoryIds.isEmpty() ? Map.of()
                : categoryRepository.findAllById(categoryIds).stream()
                        .collect(Collectors.toMap(Category::getId, Category::getName));

        return txns.stream().map(t -> {
            UUID counter = accountId.equals(t.getFromAccountId()) ? t.getToAccountId() : t.getFromAccountId();
            return new AccountDtos.TransactionItem(
                    t.getId(),
                    t.getTransactionType(),
                    t.getAmount(),
                    t.getDescription(),
                    t.getTransactionDate(),
                    t.getTransactionTime(),
                    t.getCategoryId(),
                    t.getCategoryId() == null ? null : categoryNames.get(t.getCategoryId()),
                    counter,
                    counter == null ? null : accountNames.get(counter));
        }).toList();
    }

    private BigDecimal balanceOf(Account account) {
        return account.getOpeningBalance().add(transactionRepository.netFlow(account.getId()));
    }

    private AccountDtos.AccountResponse toResponse(Account account, BigDecimal balance) {
        return new AccountDtos.AccountResponse(
                account.getId(),
                account.getName(),
                account.getAccountType(),
                balance,
                account.getOpeningBalance(),
                account.getCreditLimit(),
                account.getBillingDay(),
                account.getPaymentDueDay(),
                account.isActive());
    }
}
