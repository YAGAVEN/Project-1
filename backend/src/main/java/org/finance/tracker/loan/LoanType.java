package org.finance.tracker.loan;

/** Direction of the loan (schema.md §12) — decides the LOAN_* transaction types. */
public enum LoanType {
    LENT, BORROWED
}
