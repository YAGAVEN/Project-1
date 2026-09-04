package org.finance.tracker.loan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

public interface LoanPaymentRepository extends JpaRepository<LoanPayment, UUID> {

    List<LoanPayment> findByLoanIdOrderByPaymentDateAsc(UUID loanId);

    Optional<LoanPayment> findByIdAndLoanId(UUID id, UUID loanId);

    boolean existsByLoanId(UUID loanId);

    @Query("""
            select coalesce(sum(p.amount), 0) from LoanPayment p where p.loanId in :loanIds
            """)
    BigDecimal sumByLoanIdIn(@Param("loanIds") Collection<UUID> loanIds);

    @Query("""
            select coalesce(sum(p.amount), 0) from LoanPayment p where p.loanId = :loanId
            """)
    BigDecimal sumByLoanId(@Param("loanId") UUID loanId);

    /** Per-loan paid totals in one query — the list view's outstanding math. */
    @Query("""
            select p.loanId, sum(p.amount) from LoanPayment p where p.loanId in :loanIds group by p.loanId
            """)
    List<Object[]> sumsByLoanId(@Param("loanIds") Collection<UUID> loanIds);

    default Map<UUID, BigDecimal> paidTotalsByLoanId(Collection<UUID> loanIds) {
        if (loanIds.isEmpty()) {
            return Map.of();
        }
        return sumsByLoanId(loanIds).stream()
                .collect(Collectors.toMap(row -> (UUID) row[0], row -> (BigDecimal) row[1]));
    }
}
