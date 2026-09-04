package org.finance.tracker.loan;

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

/** /api/v1/loans (backend.md §8.7). */
@RestController
@RequestMapping("/api/v1/loans")
@RequiredArgsConstructor
public class LoanController {

    private final LoanService loanService;
    private final CurrentUser currentUser;

    @GetMapping
    List<LoanDtos.LoanResponse> list(
            @RequestParam(required = false) LoanType direction,
            @RequestParam(required = false) LoanStatus status) {
        return loanService.list(currentUser.requireUserId(), direction, status);
    }

    /** 201 — creates the loan AND its origin money-movement transaction (§9.3). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    LoanDtos.LoanResponse create(@Valid @RequestBody LoanDtos.CreateLoanRequest request) {
        return loanService.create(currentUser.requireUserId(), request);
    }

    /** 200 — original, outstanding, payment timeline. */
    @GetMapping("/{id}")
    LoanDtos.LoanResponse detail(@PathVariable UUID id) {
        return loanService.detail(currentUser.requireUserId(), id);
    }

    @PutMapping("/{id}")
    LoanDtos.LoanResponse update(@PathVariable UUID id,
                                 @Valid @RequestBody LoanDtos.UpdateLoanRequest request) {
        return loanService.update(currentUser.requireUserId(), id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        loanService.delete(currentUser.requireUserId(), id);
    }

    /** 201 — repayment transaction + payment row, atomic; timeline returned updated. */
    @PostMapping("/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    LoanDtos.LoanResponse recordPayment(@PathVariable UUID id,
                                        @Valid @RequestBody LoanDtos.CreatePaymentRequest request) {
        return loanService.recordPayment(currentUser.requireUserId(), id, request);
    }

    /** 204 — payment + its transaction removed, status recomputed. */
    @DeleteMapping("/{id}/payments/{paymentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deletePayment(@PathVariable UUID id, @PathVariable UUID paymentId) {
        loanService.deletePayment(currentUser.requireUserId(), id, paymentId);
    }
}
