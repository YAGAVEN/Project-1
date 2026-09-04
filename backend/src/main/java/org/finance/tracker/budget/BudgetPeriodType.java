package org.finance.tracker.budget;

import org.finance.tracker.common.PeriodType;

/**
 * Budget recurrence (schema.md §10 — no DAYLY: budgets never make sense per
 * day). Distinct enum from the analytics PeriodType on purpose: the DB check
 * constraint stores WEEKLY/MONTHLY/YEARLY, mapped here onto resolver windows.
 */
public enum BudgetPeriodType {
    WEEKLY, MONTHLY, YEARLY;

    public PeriodType toPeriodType() {
        return switch (this) {
            case WEEKLY -> PeriodType.WEEK;
            case MONTHLY -> PeriodType.MONTH;
            case YEARLY -> PeriodType.YEAR;
        };
    }
}
