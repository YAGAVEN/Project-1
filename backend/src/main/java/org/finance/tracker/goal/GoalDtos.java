package org.finance.tracker.goal;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request/response shapes for /api/v1/goals (backend.md §8.8). */
public final class GoalDtos {

    private GoalDtos() {
    }

    public record CreateGoalRequest(
            @NotBlank @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal targetAmount,
            LocalDate targetDate,
            @Size(max = 500, message = "Description must be at most 500 characters") String description) {
    }

    /**
     * PATCH-style PUT. status accepts only ACTIVE / CANCELLED — COMPLETED is
     * service-managed (§6.7 auto-set).
     */
    public record UpdateGoalRequest(
            @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @Positive @Digits(integer = 12, fraction = 2) BigDecimal targetAmount,
            LocalDate targetDate,
            @Size(max = 500, message = "Description must be at most 500 characters") String description,
            GoalStatus status) {
    }

    /** Allocation only — transactionId links an already-created TRANSFER (§8.8). */
    public record AddContributionRequest(
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull LocalDate contributionDate,
            @Size(max = 500, message = "Notes must be at most 500 characters") String notes,
            UUID transactionId) {
    }

    public record ContributionResponse(
            UUID id,
            BigDecimal amount,
            LocalDate contributionDate,
            String notes,
            UUID transactionId) {
    }

    /** progress/percentage always derived (§6.7). */
    public record GoalResponse(
            UUID id,
            String name,
            BigDecimal targetAmount,
            LocalDate targetDate,
            GoalStatus status,
            String description,
            BigDecimal progress,
            double percentage,
            long contributionCount) {
    }

    /** Cumulative progress-over-time — one point per contribution, chronological. */
    public record ProgressPoint(LocalDate date, BigDecimal progress) {
    }

    public record GoalDetailResponse(
            UUID id,
            String name,
            BigDecimal targetAmount,
            LocalDate targetDate,
            GoalStatus status,
            String description,
            BigDecimal progress,
            double percentage,
            List<ContributionResponse> contributions,
            List<ProgressPoint> progressSeries) {
    }
}
