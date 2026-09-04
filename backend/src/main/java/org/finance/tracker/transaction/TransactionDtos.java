package org.finance.tracker.transaction;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.finance.tracker.common.PeriodResolver;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Request/response shapes for /api/v1/transactions (backend.md §8.5).
 * Per-type field rules are enforced in the service (backend.md §9.1).
 */
public final class TransactionDtos {

    private TransactionDtos() {
    }

    public record CreateTransactionRequest(
            @NotNull TransactionType transactionType,
            @NotNull @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            UUID fromAccountId,
            UUID toAccountId,
            UUID categoryId,
            @Size(max = 500, message = "Description must be at most 500 characters") String description,
            @NotNull LocalDate transactionDate,
            LocalTime transactionTime) {
    }

    /** PATCH-style PUT; transactionType must be null or equal to the current one (immutable). */
    public record UpdateTransactionRequest(
            TransactionType transactionType,
            @Positive @Digits(integer = 12, fraction = 2) BigDecimal amount,
            UUID fromAccountId,
            UUID toAccountId,
            UUID categoryId,
            @Size(max = 500, message = "Description must be at most 500 characters") String description,
            LocalDate transactionDate,
            LocalTime transactionTime) {
    }

    /** Balances are recomputed after the write so the UI never refetches (backend.md §8.5). */
    public record TransactionResponse(
            UUID id,
            TransactionType transactionType,
            BigDecimal amount,
            UUID fromAccountId,
            String fromAccountName,
            BigDecimal fromAccountBalance,
            UUID toAccountId,
            String toAccountName,
            BigDecimal toAccountBalance,
            UUID categoryId,
            String categoryName,
            String description,
            LocalDate transactionDate,
            LocalTime transactionTime) {
    }

    public record SummaryResponse(
            BigDecimal income,
            BigDecimal expense,
            BigDecimal netCashFlow,
            long count,
            PeriodResolver.Period window) {
    }
}
