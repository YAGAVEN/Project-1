package org.finance.tracker.goal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface GoalRepository extends JpaRepository<SavingsGoal, UUID> {

    List<SavingsGoal> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<SavingsGoal> findByUserIdAndStatus(UUID userId, GoalStatus status);

    Optional<SavingsGoal> findByIdAndUserId(UUID id, UUID userId);
}
