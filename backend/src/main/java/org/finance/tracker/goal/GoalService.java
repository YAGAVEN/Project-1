package org.finance.tracker.goal;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.common.BadRequestException;
import org.finance.tracker.common.NotFoundException;
import org.finance.tracker.transaction.TransactionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Savings goals + contributions (backend.md §8.8). Contributions are
 * allocations, never money movement (plan invariant 9) — balances are untouched
 * here; if the user also moved money, the frontend records a TRANSFER and links
 * its id. Progress is always derived (§6.7); status flips are service-managed.
 */
@Service
@RequiredArgsConstructor
public class GoalService {

    private final GoalRepository goalRepository;
    private final GoalContributionRepository contributionRepository;
    private final TransactionRepository transactionRepository;

    @Transactional(readOnly = true)
    public List<GoalDtos.GoalResponse> list(UUID userId, GoalStatus status) {
        List<SavingsGoal> goals = status == null
                ? goalRepository.findByUserIdOrderByCreatedAtDesc(userId)
                : goalRepository.findByUserIdAndStatus(userId, status);

        Set<UUID> goalIds = new HashSet<>();
        for (SavingsGoal goal : goals) {
            goalIds.add(goal.getId());
        }
        Map<UUID, BigDecimal> progressByGoal = contributionRepository.progressTotalsByGoalId(goalIds);

        return goals.stream()
                .map(goal -> toResponse(goal, progressByGoal.getOrDefault(goal.getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public GoalDtos.GoalResponse create(UUID userId, GoalDtos.CreateGoalRequest request) {
        SavingsGoal goal = new SavingsGoal();
        goal.setUserId(userId);
        goal.setName(request.name());
        goal.setTargetAmount(request.targetAmount());
        goal.setTargetDate(request.targetDate());
        goal.setDescription(request.description());
        goal.setStatus(GoalStatus.ACTIVE);
        return toResponse(goalRepository.save(goal), BigDecimal.ZERO);
    }

    /** §8.8 detail — contributions list + cumulative progress-over-time series. */
    @Transactional(readOnly = true)
    public GoalDtos.GoalDetailResponse detail(UUID userId, UUID goalId) {
        SavingsGoal goal = findOwned(userId, goalId);
        List<GoalContribution> contributions =
                contributionRepository.findByGoalIdOrderByContributionDateAsc(goalId);
        BigDecimal progress = progressOf(goal);

        List<GoalDtos.ContributionResponse> rows = contributions.stream().map(this::toContributionResponse).toList();
        List<GoalDtos.ProgressPoint> series = new ArrayList<>();
        BigDecimal running = BigDecimal.ZERO;
        for (GoalContribution contribution : contributions) {
            running = running.add(contribution.getAmount());
            series.add(new GoalDtos.ProgressPoint(contribution.getContributionDate(), running));
        }

        return new GoalDtos.GoalDetailResponse(
                goal.getId(),
                goal.getName(),
                goal.getTargetAmount(),
                goal.getTargetDate(),
                goal.getStatus(),
                goal.getDescription(),
                progress,
                percentageOf(goal, progress),
                rows,
                series);
    }

    /** §8.8 — update fields; CANCELLED/ACTIVE via status; COMPLETED is service-only. */
    @Transactional
    public GoalDtos.GoalResponse update(UUID userId, UUID goalId, GoalDtos.UpdateGoalRequest request) {
        SavingsGoal goal = findOwned(userId, goalId);
        if (request.status() == GoalStatus.COMPLETED) {
            throw new BadRequestException("COMPLETED is set automatically when progress reaches the target");
        }
        if (request.name() != null) {
            goal.setName(request.name());
        }
        if (request.targetAmount() != null) {
            goal.setTargetAmount(request.targetAmount());
        }
        if (request.targetDate() != null) {
            goal.setTargetDate(request.targetDate());
        }
        if (request.description() != null) {
            goal.setDescription(request.description());
        }
        if (request.status() != null) {
            goal.setStatus(request.status());
        }
        SavingsGoal saved = goalRepository.save(goal);
        recomputeStatus(saved);
        return toResponse(saved, progressOf(saved));
    }

    /** schema.md §18 — cancel if contributions exist, hard delete only if none. Either way 204. */
    @Transactional
    public void delete(UUID userId, UUID goalId) {
        SavingsGoal goal = findOwned(userId, goalId);
        if (contributionRepository.existsByGoalId(goalId)) {
            goal.setStatus(GoalStatus.CANCELLED);
            goalRepository.save(goal);
        } else {
            goalRepository.delete(goal);
        }
    }

    /** Allocation only — no account is touched; optional linked TRANSFER id is validated. */
    @Transactional
    public GoalDtos.GoalDetailResponse addContribution(UUID userId, UUID goalId,
                                                       GoalDtos.AddContributionRequest request) {
        SavingsGoal goal = findOwned(userId, goalId);
        if (goal.getStatus() == GoalStatus.CANCELLED) {
            throw new BadRequestException("Cannot contribute to a cancelled goal");
        }
        if (request.transactionId() != null
                && transactionRepository.findByIdAndUserId(request.transactionId(), userId).isEmpty()) {
            throw NotFoundException.resource("Transaction");
        }

        GoalContribution contribution = new GoalContribution();
        contribution.setGoalId(goal.getId());
        contribution.setTransactionId(request.transactionId());
        contribution.setAmount(request.amount());
        contribution.setContributionDate(request.contributionDate());
        contribution.setNotes(request.notes());
        contributionRepository.save(contribution);

        recomputeStatus(goal);
        return detail(userId, goalId);
    }

    /** Removes a contribution; goal status recomputed (may leave COMPLETED). */
    @Transactional
    public void deleteContribution(UUID userId, UUID goalId, UUID contributionId) {
        SavingsGoal goal = findOwned(userId, goalId);
        GoalContribution contribution = contributionRepository.findByIdAndGoalId(contributionId, goalId)
                .orElseThrow(() -> NotFoundException.resource("Contribution"));
        contributionRepository.delete(contribution);
        recomputeStatus(goal);
    }

    // ---- progress engine (§6.7) ---------------------------------------------

    /** COMPLETED when progress ≥ target; back to ACTIVE if it drops below again. */
    private void recomputeStatus(SavingsGoal goal) {
        BigDecimal progress = progressOf(goal);
        if (progress.compareTo(goal.getTargetAmount()) >= 0) {
            goal.setStatus(GoalStatus.COMPLETED);
        } else if (goal.getStatus() == GoalStatus.COMPLETED) {
            goal.setStatus(GoalStatus.ACTIVE);
        }
        goalRepository.save(goal);
    }

    private BigDecimal progressOf(SavingsGoal goal) {
        return contributionRepository.sumByGoalId(goal.getId());
    }

    private double percentageOf(SavingsGoal goal, BigDecimal progress) {
        double percentage = progress.doubleValue() * 100.0 / goal.getTargetAmount().doubleValue();
        return Math.round(percentage * 10.0) / 10.0;
    }

    private GoalDtos.GoalResponse toResponse(SavingsGoal goal, BigDecimal progress) {
        return new GoalDtos.GoalResponse(
                goal.getId(),
                goal.getName(),
                goal.getTargetAmount(),
                goal.getTargetDate(),
                goal.getStatus(),
                goal.getDescription(),
                progress,
                percentageOf(goal, progress),
                contributionRepository.countByGoalId(goal.getId()));
    }

    private GoalDtos.ContributionResponse toContributionResponse(GoalContribution contribution) {
        return new GoalDtos.ContributionResponse(
                contribution.getId(),
                contribution.getAmount(),
                contribution.getContributionDate(),
                contribution.getNotes(),
                contribution.getTransactionId());
    }

    private SavingsGoal findOwned(UUID userId, UUID goalId) {
        return goalRepository.findByIdAndUserId(goalId, userId)
                .orElseThrow(() -> NotFoundException.resource("Goal"));
    }
}
