package org.finance.tracker.transaction;

/**
 * The seven transaction types (schema.md §8.1). The generic transaction API
 * accepts only INCOME / EXPENSE / TRANSFER — LOAN_* types are created
 * exclusively by the loan endpoints (backend.md §7).
 */
public enum TransactionType {
    INCOME, EXPENSE, TRANSFER,
    LOAN_GIVEN, LOAN_RECEIVED, LOAN_REPAYMENT_IN, LOAN_REPAYMENT_OUT
}
