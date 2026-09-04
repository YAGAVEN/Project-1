package org.finance.tracker.loan;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Request/response shapes for /api/v1/loans (backend.md §8.7). */
public final class LoanDtos {

    private LoanDtos() {
    }

    /** §8.7 create: LENT → LOAN_GIVEN from accountId; BORROWED → LOAN_RECEIVED to accountId. */
    public record CreateLoanRequest(
            @NotNull UUID contactId,
            @NotNull LoanType loanType,
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull LocalDate loanDate,
            @NotNull UUID accountId,
            @Size(max = 500, message = "Description must be at most 500 characters") String description) {
    }

    /** Description/contact only — amount is immutable (§7): delete + recreate instead. */
    public record UpdateLoanRequest(
            UUID contactId,
            @Size(max = 500, message = "Description must be at most 500 characters") String description) {
    }

    public record CreatePaymentRequest(
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull LocalDate paymentDate,
            @NotNull UUID accountId) {
    }

    public record PaymentResponse(
            UUID id,
            BigDecimal amount,
            LocalDate paymentDate,
            UUID accountId,
            String accountName,
            UUID transactionId) {
    }

    /** payments is populated only on the detail view. */
    public record LoanResponse(
            UUID id,
            UUID contactId,
            String contactName,
            LoanType loanType,
            LoanStatus status,
            BigDecimal originalAmount,
            BigDecimal outstanding,
            LocalDate loanDate,
            UUID accountId,
            String accountName,
            String description,
            List<PaymentResponse> payments) {
    }

    /** §6.6 portfolio totals — the dashboard widget source. */
    public record PortfolioTotals(BigDecimal totalReceivable, BigDecimal totalPayable) {
    }
}
