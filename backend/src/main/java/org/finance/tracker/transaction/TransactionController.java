package org.finance.tracker.transaction;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.finance.tracker.auth.CurrentUser;
import org.finance.tracker.common.PageResponse;
import org.finance.tracker.common.PeriodType;
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

/** /api/v1/transactions (backend.md §8.5). */
@RestController
@RequestMapping("/api/v1/transactions")
@RequiredArgsConstructor
public class TransactionController {

    private final TransactionService transactionService;
    private final CurrentUser currentUser;

    @GetMapping
    PageResponse<TransactionDtos.TransactionResponse> list(
            @RequestParam(required = false) TransactionType type,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) UUID accountId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return transactionService.list(currentUser.requireUserId(), type, categoryId, accountId,
                from, to, q, page, size);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    TransactionDtos.TransactionResponse create(@Valid @RequestBody TransactionDtos.CreateTransactionRequest request) {
        return transactionService.create(currentUser.requireUserId(), request);
    }

    @GetMapping("/summary")
    TransactionDtos.SummaryResponse summary(
            @RequestParam(required = false) PeriodType periodType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return transactionService.summary(currentUser.requireUserId(), periodType, date);
    }

    @GetMapping("/{id}")
    TransactionDtos.TransactionResponse get(@PathVariable UUID id) {
        return transactionService.get(currentUser.requireUserId(), id);
    }

    @PutMapping("/{id}")
    TransactionDtos.TransactionResponse update(@PathVariable UUID id,
                                               @Valid @RequestBody TransactionDtos.UpdateTransactionRequest request) {
        return transactionService.update(currentUser.requireUserId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        transactionService.delete(currentUser.requireUserId(), id);
    }
}
