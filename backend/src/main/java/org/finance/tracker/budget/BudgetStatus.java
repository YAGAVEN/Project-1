package org.finance.tracker.budget;

/** backend.md §6.5 — OK below 80%, WARNING through 100% inclusive, OVER beyond. */
public enum BudgetStatus {
    OK, WARNING, OVER;

    public static BudgetStatus of(double percentageUsed) {
        if (percentageUsed < 80) {
            return OK;
        }
        return percentageUsed <= 100 ? WARNING : OVER;
    }
}
