package org.finance.tracker.transaction;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Filtered search goes through JpaSpecificationExecutor (dynamic filter mix);
 * the derived-math queries here are the single source of every balance and
 * total in the app (backend.md §6.2/§6.3).
 */
public interface TransactionRepository extends JpaRepository<Transaction, UUID>,
        JpaSpecificationExecutor<Transaction> {

    /** backend.md §6.3 — income and expense totals; TRANSFER and LOAN_* never enter these. */
    @Query("""
            select coalesce(sum(t.amount), 0) from Transaction t
            where t.userId = :userId and t.transactionType = :type
              and t.transactionDate >= :start and t.transactionDate < :end
            """)
    BigDecimal sumAmountByTypeInWindow(@Param("userId") UUID userId, @Param("type") TransactionType type,
                                       @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("""
            select count(t) from Transaction t
            where t.userId = :userId and t.transactionDate >= :start and t.transactionDate < :end
            """)
    long countInWindow(@Param("userId") UUID userId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** backend.md §6.2 — money in minus money out over all history; one rule for every account type. */
    @Query("""
            select coalesce(sum(
                case when t.toAccountId = :accountId then t.amount else 0 end
                - case when t.fromAccountId = :accountId then t.amount else 0 end), 0)
            from Transaction t
            where t.fromAccountId = :accountId or t.toAccountId = :accountId
            """)
    BigDecimal netFlow(@Param("accountId") UUID accountId);

    /** Net flow strictly before a date — the running-start point for balance trends. */
    @Query("""
            select coalesce(sum(
                case when t.toAccountId = :accountId then t.amount else 0 end
                - case when t.fromAccountId = :accountId then t.amount else 0 end), 0)
            from Transaction t
            where (t.fromAccountId = :accountId or t.toAccountId = :accountId)
              and t.transactionDate < :date
            """)
    BigDecimal netFlowBefore(@Param("accountId") UUID accountId, @Param("date") LocalDate date);

    /** Per-day net flow within a window — balance trend buckets accumulate from this. */
    @Query("""
            select t.transactionDate,
                   sum(
                       case when t.toAccountId = :accountId then t.amount else 0 end
                       - case when t.fromAccountId = :accountId then t.amount else 0 end)
            from Transaction t
            where (t.fromAccountId = :accountId or t.toAccountId = :accountId)
              and t.transactionDate >= :start and t.transactionDate < :end
            group by t.transactionDate
            order by t.transactionDate
            """)
    List<Object[]> netFlowByDay(@Param("accountId") UUID accountId,
                                @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** Row 0 = money in, row 1 = money out (single-row aggregate). */
    @Query("""
            select coalesce(sum(case when t.toAccountId = :accountId then t.amount else 0 end), 0),
                   coalesce(sum(case when t.fromAccountId = :accountId then t.amount else 0 end), 0)
            from Transaction t
            where (t.fromAccountId = :accountId or t.toAccountId = :accountId)
              and t.transactionDate >= :start and t.transactionDate < :end
            """)
    List<Object[]> moneyInOut(@Param("accountId") UUID accountId,
                              @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** Most recent transactions touching an account — pass PageRequest.of(0, limit). */
    @Query("""
            select t from Transaction t
            where t.fromAccountId = :accountId or t.toAccountId = :accountId
            order by t.transactionDate desc, t.createdAt desc
            """)
    List<Transaction> recentForAccount(@Param("accountId") UUID accountId, Pageable pageable);

    /** Most recent transactions across all accounts — dashboard §8.9. */
    @Query("""
            select t from Transaction t where t.userId = :userId
            order by t.transactionDate desc, t.createdAt desc
            """)
    List<Transaction> recentForUser(@Param("userId") UUID userId, Pageable pageable);

    /** §8.10 account-cashflow — Σ money in per receiving account. */
    @Query("""
            select t.toAccountId, sum(t.amount) from Transaction t
            where t.userId = :userId and t.transactionDate >= :start and t.transactionDate < :end
            group by t.toAccountId
            """)
    List<Object[]> inflowByAccount(@Param("userId") UUID userId,
                                   @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** §8.10 account-cashflow — Σ money out per sending account. */
    @Query("""
            select t.fromAccountId, sum(t.amount) from Transaction t
            where t.userId = :userId and t.transactionDate >= :start and t.transactionDate < :end
            group by t.fromAccountId
            """)
    List<Object[]> outflowByAccount(@Param("userId") UUID userId,
                                    @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** backend.md §6.5 — Σ for one category in a window (budget usage). */
    @Query("""
            select coalesce(sum(t.amount), 0) from Transaction t
            where t.userId = :userId and t.transactionType = :type and t.categoryId = :categoryId
              and t.transactionDate >= :start and t.transactionDate < :end
            """)
    BigDecimal sumByCategoryInWindow(@Param("userId") UUID userId, @Param("type") TransactionType type,
                                     @Param("categoryId") UUID categoryId,
                                     @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** backend.md §6.4 — monthSpend for a credit card (Σ from this card only). */
    @Query("""
            select coalesce(sum(t.amount), 0) from Transaction t
            where t.fromAccountId = :accountId and t.transactionType = :type
              and t.transactionDate >= :start and t.transactionDate < :end
            """)
    BigDecimal sumByFromAccountInWindow(@Param("accountId") UUID accountId, @Param("type") TransactionType type,
                                        @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** Dashboard §8.9 — expense per category in a window (donut + comparison). */
    @Query("""
            select t.categoryId, sum(t.amount) from Transaction t
            where t.userId = :userId and t.transactionType = :type
              and t.transactionDate >= :start and t.transactionDate < :end
            group by t.categoryId
            """)
    List<Object[]> totalsByCategory(@Param("userId") UUID userId, @Param("type") TransactionType type,
                                    @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** Dashboard §8.9 — daily income/expense totals; week/month buckets accumulate from this. */
    @Query("""
            select t.transactionDate, t.transactionType, sum(t.amount) from Transaction t
            where t.userId = :userId and t.transactionType in :types
              and t.transactionDate >= :start and t.transactionDate < :end
            group by t.transactionDate, t.transactionType
            order by t.transactionDate
            """)
    List<Object[]> dailyTotalsByType(@Param("userId") UUID userId,
                                     @Param("types") Collection<TransactionType> types,
                                     @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** DAY granularity rows — hours are bucketed in Java (transaction_time is optional). */
    @Query("""
            select t from Transaction t
            where t.userId = :userId and t.transactionType in :types
              and t.transactionDate >= :start and t.transactionDate < :end
            """)
    List<Transaction> findInWindow(@Param("userId") UUID userId,
                                   @Param("types") Collection<TransactionType> types,
                                   @Param("start") LocalDate start, @Param("end") LocalDate end);

    @Query("""
            select count(t) > 0 from Transaction t
            where t.fromAccountId = :accountId or t.toAccountId = :accountId
            """)
    boolean existsReferencingAccount(@Param("accountId") UUID accountId);

    @Query("""
            select count(t) > 0 from Transaction t
            where t.userId = :userId and t.categoryId = :categoryId
            """)
    boolean existsReferencingCategory(@Param("userId") UUID userId, @Param("categoryId") UUID categoryId);

    Optional<Transaction> findByIdAndUserId(UUID id, UUID userId);
}
