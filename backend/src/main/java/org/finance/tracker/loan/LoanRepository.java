package org.finance.tracker.loan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LoanRepository extends JpaRepository<Loan, UUID> {

    List<Loan> findByUserIdOrderByStartDateDesc(UUID userId);

    List<Loan> findByUserIdAndContactId(UUID userId, UUID contactId);

    List<Loan> findByUserIdAndStatus(UUID userId, LoanStatus status);

    Optional<Loan> findByIdAndUserId(UUID id, UUID userId);

    boolean existsByUserIdAndContactId(UUID userId, UUID contactId);
}
