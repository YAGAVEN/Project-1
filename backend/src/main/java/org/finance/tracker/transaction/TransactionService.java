package org.finance.tracker.transaction;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.account.Account;
import org.finance.tracker.account.AccountRepository;
import org.finance.tracker.account.AccountService;
import org.finance.tracker.account.AccountType;
import org.finance.tracker.category.Category;
import org.finance.tracker.category.CategoryRepository;
import org.finance.tracker.category.CategoryService;
import org.finance.tracker.category.CategoryType;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.ConflictException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.common.PageResponse;
import org.finance.tracker.common.PeriodResolver;
import org.finance.tracker.common.PeriodType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Transaction CRUD + the §9.1 validation matrix. Every write path scopes by
 * the authenticated userId (backend.md §9.2) and re-derives balances for the
 * response so the UI never refetches (§9.3).
 */
@Service
@RequiredArgsConstructor
public class TransactionService {

    private static final int MAX_PAGE_SIZE = 100;

    private final TransactionRepository transactionRepository;
    private final AccountService accountService;
    private final AccountRepository accountRepository;
    private final CategoryService categoryService;
    private final CategoryRepository categoryRepository;

    @Transactional(readOnly = true)
    public PageResponse<TransactionDtos.TransactionResponse> list(UUID userId, TransactionType type,
                                                                  UUID categoryId, UUID accountId,
                                                                  LocalDate from, LocalDate to, String q,
                                                                  int page, int size) {
        Page<Transaction> result = transactionRepository.findAll(
                searchSpec(userId, type, categoryId, accountId, from, to, q),
                // §8.5 — ledger is always newest-first; createdAt breaks same-day ties
                PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE),
                        Sort.by(Sort.Direction.DESC, "transactionDate", "createdAt")));

        Map<UUID, Account> accounts = batchAccounts(collectAccountIds(result.getContent()));
        Map<UUID, Category> categories = batchCategories(collectCategoryIds(result.getContent()));

        List<TransactionDtos.TransactionResponse> content = result.getContent().stream()
                .map(t -> toResponse(t, accounts, categories))
                .toList();
        return new PageResponse<>(content, result.getNumber(), result.getSize(), result.getTotalElements());
    }

    /** backend.md §9.3 — insert + balance recompute happen in one transaction. */
    @Transactional
    public TransactionDtos.TransactionResponse create(UUID userId, TransactionDtos.CreateTransactionRequest request) {
        ResolvedSides sides = resolveSides(userId, request.transactionType(),
                request.fromAccountId(), request.toAccountId(), request.categoryId());

        Transaction txn = new Transaction();
        txn.setUserId(userId);
        txn.setTransactionType(request.transactionType());
        txn.setAmount(request.amount());
        txn.setFromAccountId(request.fromAccountId());
        txn.setToAccountId(request.toAccountId());
        txn.setCategoryId(request.categoryId());
        txn.setDescription(request.description());
        txn.setTransactionDate(request.transactionDate());
        txn.setTransactionTime(request.transactionTime());

        Transaction saved = transactionRepository.save(txn);
        return toResponse(saved, sides.from(), sides.to(), sides.category());
    }

    @Transactional(readOnly = true)
    public TransactionDtos.TransactionResponse get(UUID userId, UUID transactionId) {
        Transaction txn = findOwned(userId, transactionId);
        // No active-checks here: the row already exists, so deactivated-but-referenced
        // accounts/categories must still render.
        Account from = txn.getFromAccountId() == null ? null : accountService.getOwnedAccount(userId, txn.getFromAccountId());
        Account to = txn.getToAccountId() == null ? null : accountService.getOwnedAccount(userId, txn.getToAccountId());
        Category category = txn.getCategoryId() == null ? null : categoryService.getOwnedCategory(userId, txn.getCategoryId());
        return toResponse(txn, from, to, category);
    }

    /** Type is immutable (schema.md §18): reject a changed type, merge the patch, re-validate the whole row. */
    @Transactional
    public TransactionDtos.TransactionResponse update(UUID userId, UUID transactionId,
                                                      TransactionDtos.UpdateTransactionRequest request) {
        Transaction txn = findOwned(userId, transactionId);
        if (request.transactionType() != null && request.transactionType() != txn.getTransactionType()) {
            throw new BadRequestException(
                    "transactionType is immutable — delete this transaction and create a new one");
        }

        TransactionType type = txn.getTransactionType();
        UUID fromId = request.fromAccountId() != null ? request.fromAccountId() : txn.getFromAccountId();
        UUID toId = request.toAccountId() != null ? request.toAccountId() : txn.getToAccountId();
        UUID categoryId = request.categoryId() != null ? request.categoryId() : txn.getCategoryId();
        ResolvedSides sides = resolveSides(userId, type, fromId, toId, categoryId);

        if (request.amount() != null) {
            txn.setAmount(request.amount());
        }
        txn.setFromAccountId(fromId);
        txn.setToAccountId(toId);
        txn.setCategoryId(categoryId);
        if (request.description() != null) {
            txn.setDescription(request.description());
        }
        if (request.transactionDate() != null) {
            txn.setTransactionDate(request.transactionDate());
        }
        if (request.transactionTime() != null) {
            txn.setTransactionTime(request.transactionTime());
        }

        Transaction saved = transactionRepository.save(txn);
        return toResponse(saved, sides.from(), sides.to(), sides.category());
    }

    @Transactional
    public void delete(UUID userId, UUID transactionId) {
        Transaction txn = findOwned(userId, transactionId);
        transactionRepository.delete(txn);
    }

    /** backend.md §6.3 — only INCOME and EXPENSE enter the totals; TRANSFER/LOAN_* never do. */
    @Transactional(readOnly = true)
    public TransactionDtos.SummaryResponse summary(UUID userId, PeriodType periodType, LocalDate date) {
        PeriodResolver.Period window = PeriodResolver.resolve(periodType, date);
        LocalDate start = window.startDate();
        LocalDate endExclusive = window.endDate().plusDays(1);

        BigDecimal income = transactionRepository.sumAmountByTypeInWindow(userId, TransactionType.INCOME, start, endExclusive);
        BigDecimal expense = transactionRepository.sumAmountByTypeInWindow(userId, TransactionType.EXPENSE, start, endExclusive);
        long count = transactionRepository.countInWindow(userId, start, endExclusive);

        return new TransactionDtos.SummaryResponse(income, expense, income.subtract(expense), count, window);
    }

    // ---- validation matrix (backend.md §9.1) -------------------------------

    private record ResolvedSides(Account from, Account to, Category category) {
    }

    private ResolvedSides resolveSides(UUID userId, TransactionType type, UUID fromId, UUID toId, UUID categoryId) {
        return switch (type) {
            case INCOME -> {
                requireNull(fromId, "fromAccountId must be empty for INCOME");
                Account to = requireAccount(userId, toId, "INCOME requires toAccountId");
                if (to.getAccountType() == AccountType.CREDIT_CARD) {
                    // backend.md §10 — money entering a card is a bill payment, i.e. a TRANSFER
                    throw new ConflictException("Money cannot enter a credit card — record the bill payment as a TRANSFER");
                }
                yield new ResolvedSides(null, to, requireCategory(userId, categoryId, CategoryType.INCOME));
            }
            case EXPENSE -> {
                Account from = requireAccount(userId, fromId, "EXPENSE requires fromAccountId");
                requireNull(toId, "toAccountId must be empty for EXPENSE");
                yield new ResolvedSides(from, null, requireCategory(userId, categoryId, CategoryType.EXPENSE));
            }
            case TRANSFER -> {
                Account from = requireAccount(userId, fromId, "TRANSFER requires fromAccountId");
                Account to = requireAccount(userId, toId, "TRANSFER requires toAccountId");
                if (fromId.equals(toId)) {
                    throw new ConflictException("Cannot transfer to the same account");
                }
                requireNull(categoryId, "categoryId must be empty for TRANSFER");
                yield new ResolvedSides(from, to, null);
            }
            case LOAN_GIVEN, LOAN_RECEIVED, LOAN_REPAYMENT_IN, LOAN_REPAYMENT_OUT ->
                    throw new BadRequestException(
                            type + " is created via the loan endpoints, not the transaction API");
        };
    }

    private Account requireAccount(UUID userId, UUID accountId, String requirement) {
        if (accountId == null) {
            throw new BadRequestException(requirement);
        }
        Account account = accountService.getOwnedAccount(userId, accountId);
        if (!account.isActive()) {
            throw new BadRequestException("Account '" + account.getName() + "' is deactivated");
        }
        return account;
    }

    private Category requireCategory(UUID userId, UUID categoryId, CategoryType expected) {
        if (categoryId == null) {
            throw new BadRequestException(expected + " category is required");
        }
        Category category = categoryService.getOwnedCategory(userId, categoryId);
        if (!category.isActive()) {
            throw new BadRequestException("Category '" + category.getName() + "' is deactivated");
        }
        if (category.getCategoryType() != expected) {
            throw new BadRequestException(
                    "Category '" + category.getName() + "' is " + category.getCategoryType()
                            + ", but a " + expected + " category is required");
        }
        return category;
    }

    private void requireNull(UUID id, String message) {
        if (id != null) {
            throw new BadRequestException(message);
        }
    }

    private Transaction findOwned(UUID userId, UUID transactionId) {
        return transactionRepository.findByIdAndUserId(transactionId, userId)
                .orElseThrow(() -> NotFoundException.resource("Transaction"));
    }

    // ---- search ------------------------------------------------------------

    private Specification<Transaction> searchSpec(UUID userId, TransactionType type, UUID categoryId,
                                                  UUID accountId, LocalDate from, LocalDate to, String q) {
        return (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            if (type != null) {
                predicates.add(cb.equal(root.get("transactionType"), type));
            }
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("categoryId"), categoryId));
            }
            if (accountId != null) {
                predicates.add(cb.or(
                        cb.equal(root.get("fromAccountId"), accountId),
                        cb.equal(root.get("toAccountId"), accountId)));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("transactionDate"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("transactionDate"), to));
            }
            if (q != null && !q.isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("description")), "%" + q.toLowerCase() + "%"));
            }
            return cb.and(predicates.toArray(new jakarta.persistence.criteria.Predicate[0]));
        };
    }

    // ---- response mapping --------------------------------------------------

    /** Write paths: the validated entities are already in hand — recompute balances (§8.5). */
    private TransactionDtos.TransactionResponse toResponse(Transaction txn, Account from, Account to, Category category) {
        return new TransactionDtos.TransactionResponse(
                txn.getId(),
                txn.getTransactionType(),
                txn.getAmount(),
                txn.getFromAccountId(),
                from == null ? null : from.getName(),
                from == null ? null : accountService.currentBalance(from),
                txn.getToAccountId(),
                to == null ? null : to.getName(),
                to == null ? null : accountService.currentBalance(to),
                txn.getCategoryId(),
                category == null ? null : category.getName(),
                txn.getDescription(),
                txn.getTransactionDate(),
                txn.getTransactionTime());
    }

    /** List mapping — names are batch-loaded, balances are intentionally omitted. */
    private TransactionDtos.TransactionResponse toResponse(Transaction txn,
                                                           Map<UUID, Account> accounts,
                                                           Map<UUID, Category> categories) {
        Account from = txn.getFromAccountId() == null ? null : accounts.get(txn.getFromAccountId());
        Account to = txn.getToAccountId() == null ? null : accounts.get(txn.getToAccountId());
        Category category = txn.getCategoryId() == null ? null : categories.get(txn.getCategoryId());

        return new TransactionDtos.TransactionResponse(
                txn.getId(),
                txn.getTransactionType(),
                txn.getAmount(),
                txn.getFromAccountId(),
                from == null ? null : from.getName(),
                null,
                txn.getToAccountId(),
                to == null ? null : to.getName(),
                null,
                txn.getCategoryId(),
                category == null ? null : category.getName(),
                txn.getDescription(),
                txn.getTransactionDate(),
                txn.getTransactionTime());
    }

    private Set<UUID> collectAccountIds(List<Transaction> txns) {
        Set<UUID> ids = new HashSet<>();
        for (Transaction t : txns) {
            if (t.getFromAccountId() != null) {
                ids.add(t.getFromAccountId());
            }
            if (t.getToAccountId() != null) {
                ids.add(t.getToAccountId());
            }
        }
        return ids;
    }

    private Set<UUID> collectCategoryIds(List<Transaction> txns) {
        Set<UUID> ids = new HashSet<>();
        for (Transaction t : txns) {
            if (t.getCategoryId() != null) {
                ids.add(t.getCategoryId());
            }
        }
        return ids;
    }

    private Map<UUID, Account> batchAccounts(Set<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return accountRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Account::getId, Function.identity()));
    }

    private Map<UUID, Category> batchCategories(Set<UUID> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        return categoryRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
    }
}
