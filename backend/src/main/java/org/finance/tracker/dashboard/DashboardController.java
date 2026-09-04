package org.finance.tracker.dashboard;

import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.finance.tracker.common.PeriodType;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** GET /api/v1/dashboard — the single aggregated call (backend.md §8.9). */
@RestController
@RequestMapping("/api/v1/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;
    private final CurrentUser currentUser;

    @GetMapping
    DashboardDtos.DashboardResponse dashboard(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return dashboardService.dashboard(currentUser.requireUserId(), periodType, date);
    }
}
