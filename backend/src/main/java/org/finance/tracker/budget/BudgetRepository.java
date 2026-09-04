package org.finance.tracker.budget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetRepository extends JpaRepository<Budget, UUID> {

    List<Budget> findByUserIdAndIsActiveTrueOrderByCreatedAtAsc(UUID userId);

    Optional<Budget> findByIdAndUserId(UUID id, UUID userId);

    /** Backed by the uq_budget_template partial unique index — checked here for a clean 409. */
    boolean existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrue(UUID userId, UUID categoryId,
                                                                    BudgetPeriodType periodType);

    boolean existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrueAndIdNot(UUID userId, UUID categoryId,
                                                                            BudgetPeriodType periodType, UUID id);
}
