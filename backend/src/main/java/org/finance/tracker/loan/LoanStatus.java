package org.finance.tracker.loan;

/**
 * Loan lifecycle (schema.md §12). The service flips ACTIVE → PAID when
 * outstanding reaches 0; CANCELLED exists in the schema but no v1 endpoint
 * sets it.
 */
public enum LoanStatus {
    ACTIVE, PAID, CANCELLED
}
