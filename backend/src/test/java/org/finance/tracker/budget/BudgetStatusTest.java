package org.finance.tracker.budget;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Exact §6.5 boundaries: OK < 80, WARNING through 100 inclusive, OVER beyond. */
class BudgetStatusTest {

    @Test
    void belowEightyIsOk() {
        assertThat(BudgetStatus.of(0)).isEqualTo(BudgetStatus.OK);
        assertThat(BudgetStatus.of(79.9)).isEqualTo(BudgetStatus.OK);
    }

    @Test
    void eightyThroughHundredInclusiveIsWarning() {
        assertThat(BudgetStatus.of(80)).isEqualTo(BudgetStatus.WARNING);
        assertThat(BudgetStatus.of(99.9)).isEqualTo(BudgetStatus.WARNING);
        assertThat(BudgetStatus.of(100)).isEqualTo(BudgetStatus.WARNING);
    }

    @Test
    void justOverHundredIsOver() {
        assertThat(BudgetStatus.of(100.1)).isEqualTo(BudgetStatus.OVER);
        assertThat(BudgetStatus.of(250)).isEqualTo(BudgetStatus.OVER);
    }
}
