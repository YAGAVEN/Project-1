package org.finance.tracker;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Smoke test only: the Initializr-generated @SpringBootTest contextLoads needs
 * a live Supabase datasource, which `./mvnw test` does not have. Real coverage
 * lives in the unit tests (PeriodResolver, BudgetStatus, transaction validation
 * matrix, loan paths); Testcontainers integration tests are parked until a
 * Docker-based environment exists.
 */
class BackendApplicationTests {

    @Test
    void applicationClassIsOnTheClasspath() {
        assertThat(BackendApplication.class).isNotNull();
    }
}
