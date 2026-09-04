package org.finance.tracker.goal;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** /api/v1/goals (backend.md §8.8). */
@RestController
@RequestMapping("/api/v1/goals")
@RequiredArgsConstructor
public class GoalController {

    private final GoalService goalService;
    private final CurrentUser currentUser;

    @GetMapping
    List<GoalDtos.GoalResponse> list(@RequestParam(required = false) GoalStatus status) {
        return goalService.list(currentUser.requireUserId(), status);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    GoalDtos.GoalResponse create(@Valid @RequestBody GoalDtos.CreateGoalRequest request) {
        return goalService.create(currentUser.requireUserId(), request);
    }

    /** 200 — contributions list + progress-over-time series. */
    @GetMapping("/{id}")
    GoalDtos.GoalDetailResponse detail(@PathVariable UUID id) {
        return goalService.detail(currentUser.requireUserId(), id);
    }

    @PutMapping("/{id}")
    GoalDtos.GoalResponse update(@PathVariable UUID id,
                                 @Valid @RequestBody GoalDtos.UpdateGoalRequest request) {
        return goalService.update(currentUser.requireUserId(), id, request);
    }

    /** 204 — cancel-if-referenced per §18; check the status field to know which. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        goalService.delete(currentUser.requireUserId(), id);
    }

    /** 201 — allocation recorded; returns the refreshed detail (progress + series). */
    @PostMapping("/{id}/contributions")
    @ResponseStatus(HttpStatus.CREATED)
    GoalDtos.GoalDetailResponse addContribution(@PathVariable UUID id,
                                                @Valid @RequestBody GoalDtos.AddContributionRequest request) {
        return goalService.addContribution(currentUser.requireUserId(), id, request);
    }

    /** 204 — contribution removed, goal status recomputed. */
    @DeleteMapping("/{id}/contributions/{contributionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteContribution(@PathVariable UUID id, @PathVariable UUID contributionId) {
        goalService.deleteContribution(currentUser.requireUserId(), id, contributionId);
    }
}
