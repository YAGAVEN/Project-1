package org.finance.tracker.goal;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

public interface GoalContributionRepository extends JpaRepository<GoalContribution, UUID> {

    List<GoalContribution> findByGoalIdOrderByContributionDateAsc(UUID goalId);

    Optional<GoalContribution> findByIdAndGoalId(UUID id, UUID goalId);

    boolean existsByGoalId(UUID goalId);

    long countByGoalId(UUID goalId);

    @Query("""
            select coalesce(sum(c.amount), 0) from GoalContribution c where c.goalId = :goalId
            """)
    BigDecimal sumByGoalId(@Param("goalId") UUID goalId);

    /** Per-goal progress totals in one query — the list view's batch. */
    @Query("""
            select c.goalId, sum(c.amount) from GoalContribution c where c.goalId in :goalIds group by c.goalId
            """)
    List<Object[]> sumsByGoalIdIn(@Param("goalIds") Collection<UUID> goalIds);

    default Map<UUID, BigDecimal> progressTotalsByGoalId(Collection<UUID> goalIds) {
        if (goalIds.isEmpty()) {
            return Map.of();
        }
        return sumsByGoalIdIn(goalIds).stream()
                .collect(Collectors.toMap(row -> (UUID) row[0], row -> (BigDecimal) row[1]));
    }

    /** §8.10 savings-progress — per-day contribution totals within a window. */
    @Query("""
            select c.contributionDate, sum(c.amount) from GoalContribution c
            where c.goalId in :goalIds and c.contributionDate >= :start and c.contributionDate < :end
            group by c.contributionDate order by c.contributionDate
            """)
    List<Object[]> dailyTotals(@Param("goalIds") Collection<UUID> goalIds,
                               @Param("start") LocalDate start, @Param("end") LocalDate end);

    /** Everything contributed strictly before a date — the cumulative line's base. */
    @Query("""
            select coalesce(sum(c.amount), 0) from GoalContribution c
            where c.goalId in :goalIds and c.contributionDate < :date
            """)
    BigDecimal sumBefore(@Param("goalIds") Collection<UUID> goalIds, @Param("date") LocalDate date);
}
