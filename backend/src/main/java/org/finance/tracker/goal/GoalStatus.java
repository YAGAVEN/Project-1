package org.finance.tracker.goal;

/**
 * Goal lifecycle (schema.md §14). COMPLETED is set automatically by the
 * service when progress reaches the target (§6.7) — never by the client.
 */
public enum GoalStatus {
    ACTIVE, COMPLETED, CANCELLED
}
