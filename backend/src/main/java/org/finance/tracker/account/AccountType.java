package org.finance.tracker.account;

/**
 * Where money lives (schema.md §6). One balance formula covers all four types;
 * a CREDIT_CARD balance is normally negative and represents outstanding debt.
 */
public enum AccountType {
    BANK, CASH, CREDIT_CARD, INVESTMENT
}
