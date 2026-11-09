package org.finance.tracker.loan;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LoanRepository extends JpaRepository<Loan, UUID> {

    List<Loan> findByUserIdOrderByStartDateDesc(UUID userId);

    List<Loan> findByUserIdAndContactId(UUID userId, UUID contactId);

    /** Contact summaries exclude cancelled loans — they are mistaken entries, not money owed. */
    List<Loan> findByUserIdAndContactIdAndStatusNot(UUID userId, UUID contactId, LoanStatus status);

    List<Loan> findByUserIdAndStatus(UUID userId, LoanStatus status);

    Optional<Loan> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndContactId(UUID userId, UUID contactId);

    /** Audit Phase 2 — the generic ledger must not touch loan-backed transactions. */
    boolean existsByTransactionId(UUID transactionId);

    /**
     * Audit Phase 2 (H-5): serializes concurrent repayments on one loan so the
     * outstanding check + payment write cannot interleave into an overpayment.
     * Row-level SELECT ... FOR UPDATE; used by recordPayment and deletePayment.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from Loan l where l.id = :id and l.userId = :userId")
    Optional<Loan> findByIdAndUserIdForUpdate(@Param("id") UUID id, @Param("userId") UUID userId);
}
