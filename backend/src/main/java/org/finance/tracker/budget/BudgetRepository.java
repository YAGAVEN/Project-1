package org.finance.tracker.budget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface BudgetRepository extends JpaRepository<Budget, UUID> {

    List<Budget> findByUserIdAndIsActiveTrueOrderByCreatedAtAsc(UUID userId);

    /** All templates (active or not) on the categories being removed — they must not orphan. */
    List<Budget> findAllByUserIdAndCategoryIdIn(UUID userId, Collection<UUID> categoryIds);

    Optional<Budget> findByIdAndUserId(UUID id, UUID userId);

    /** Backed by the uq_budget_template partial unique index — checked here for a clean 409. */
    boolean existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrue(UUID userId, UUID categoryId,
                                                                    BudgetPeriodType periodType);

    boolean existsByUserIdAndCategoryIdAndPeriodTypeAndIsActiveTrueAndIdNot(UUID userId, UUID categoryId,
                                                                            BudgetPeriodType periodType, UUID id);
}
