package org.finance.tracker.account;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.finance.tracker.transaction.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * Request/response shapes for /api/v1/accounts (backend.md §8.3).
 * Money is BigDecimal to match NUMERIC(14,2) (backend.md §3.3).
 */
public final class AccountDtos {

    private AccountDtos() {
    }

    public record CreateAccountRequest(
            @NotBlank @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @NotNull AccountType accountType,
            @NotNull @Digits(integer = 12, fraction = 2) BigDecimal openingBalance,
            /** Required iff accountType is CREDIT_CARD — enforced in the service. */
            @Digits(integer = 12, fraction = 2) BigDecimal creditLimit,
            @Min(1) @Max(31) Short billingDay,
            @Min(1) @Max(31) Short paymentDueDay) {
    }

    /** PATCH-style PUT: null fields mean "leave unchanged" (same as ProfileService). */
    public record UpdateAccountRequest(
            @Size(max = 120, message = "Name must be at most 120 characters") String name,
            @Digits(integer = 12, fraction = 2) BigDecimal creditLimit,
            @Min(1) @Max(31) Short billingDay,
            @Min(1) @Max(31) Short paymentDueDay,
            Boolean isActive) {
    }

    /** balance is derived from transactions (backend.md §6.2), never stored. */
    public record AccountResponse(
            UUID id,
            String name,
            AccountType accountType,
            BigDecimal balance,
            BigDecimal openingBalance,
            BigDecimal creditLimit,
            Short billingDay,
            Short paymentDueDay,
            boolean isActive) {
    }

    /** Card math from backend.md §6.4. */
    public record CardMetrics(BigDecimal outstanding, BigDecimal availableCredit) {
    }

    /** Closing balance at the end of one trend bucket (daily, or monthly for YEAR). */
    public record TrendPoint(LocalDate bucket, BigDecimal closingBalance) {
    }

    /** Compact recent-transaction row for the account detail page. */
    public record TransactionItem(
            UUID id,
            TransactionType transactionType,
            BigDecimal amount,
            String description,
            LocalDate transactionDate,
            LocalTime transactionTime,
            UUID categoryId,
            String categoryName,
            UUID counterAccountId,
            String counterAccountName) {
    }

    /** backend.md §8.3 — balance, card metrics, window money in/out, trend, recent transactions. */
    public record AccountDetailResponse(
            UUID id,
            String name,
            AccountType accountType,
            BigDecimal balance,
            BigDecimal openingBalance,
            BigDecimal creditLimit,
            Short billingDay,
            Short paymentDueDay,
            boolean isActive,
            CardMetrics cardMetrics,
            BigDecimal moneyIn,
            BigDecimal moneyOut,
            List<TrendPoint> balanceTrend,
            List<TransactionItem> recentTransactions) {
    }
}
