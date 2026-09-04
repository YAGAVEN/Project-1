package org.finance.tracker.budget;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.finance.tracker.common.PageResponse;
import org.finance.tracker.transaction.TransactionDtos;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.LocalDate;
import java.util.UUID;

/** /api/v1/budgets (backend.md §8.6). */
@RestController
@RequestMapping("/api/v1/budgets")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService budgetService;
    private final CurrentUser currentUser;

    @GetMapping
    BudgetDtos.BudgetListResponse list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return budgetService.list(currentUser.requireUserId(), date);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    BudgetDtos.UsageItem create(@Valid @RequestBody BudgetDtos.CreateBudgetRequest request) {
        return budgetService.create(currentUser.requireUserId(), request);
    }

    @PutMapping("/{id}")
    BudgetDtos.UsageItem update(@PathVariable UUID id,
                                @Valid @RequestBody BudgetDtos.UpdateBudgetRequest request) {
        return budgetService.update(currentUser.requireUserId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        budgetService.delete(currentUser.requireUserId(), id);
    }

    @GetMapping("/{id}/transactions")
    PageResponse<TransactionDtos.TransactionResponse> transactions(
            @PathVariable UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return budgetService.transactions(currentUser.requireUserId(), id, date);
    }

    @GetMapping("/{id}/history")
    BudgetDtos.HistoryResponse history(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "6") int periods) {
        return budgetService.history(currentUser.requireUserId(), id, periods);
    }
}
