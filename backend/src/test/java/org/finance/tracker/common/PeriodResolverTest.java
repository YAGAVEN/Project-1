package org.finance.tracker.common;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The period windows every list/chart/summary depends on (backend.md §6.1). */
class PeriodResolverTest {

    @Test
    void dayWindowIsThatSingleDay() {
        var window = PeriodResolver.resolve(PeriodType.DAY, LocalDate.of(2026, 9, 4));

        assertThat(window.startDate()).isEqualTo(LocalDate.of(2026, 9, 4));
        assertThat(window.endDate()).isEqualTo(LocalDate.of(2026, 9, 4));
    }

    @Test
    void weekRunsMondayToSunday() {
        // 2024-01-10 is a Wednesday
        var window = PeriodResolver.resolve(PeriodType.WEEK, LocalDate.of(2024, 1, 10));

        assertThat(window.startDate()).isEqualTo(LocalDate.of(2024, 1, 8));
        assertThat(window.endDate()).isEqualTo(LocalDate.of(2024, 1, 14));
    }

    @Test
    void sundayStaysInsideItsOwnWeek() {
        var window = PeriodResolver.resolve(PeriodType.WEEK, LocalDate.of(2024, 1, 14));

        assertThat(window.startDate()).isEqualTo(LocalDate.of(2024, 1, 8));
        assertThat(window.endDate()).isEqualTo(LocalDate.of(2024, 1, 14));
    }

    @Test
    void monthHandlesShortAndLeapFebruary() {
        var leap = PeriodResolver.resolve(PeriodType.MONTH, LocalDate.of(2024, 2, 10));
        assertThat(leap.endDate().getDayOfMonth()).isEqualTo(29);

        var common = PeriodResolver.resolve(PeriodType.MONTH, LocalDate.of(2023, 2, 10));
        assertThat(common.endDate().getDayOfMonth()).isEqualTo(28);
    }

    @Test
    void yearWindowIsJanOneToDecThirtyOne() {
        var window = PeriodResolver.resolve(PeriodType.YEAR, LocalDate.of(2024, 5, 5));

        assertThat(window.startDate()).isEqualTo(LocalDate.of(2024, 1, 1));
        assertThat(window.endDate()).isEqualTo(LocalDate.of(2024, 12, 31));
    }

    @Test
    void missingSelectorDefaultsToCurrentMonth() {
        var window = PeriodResolver.resolve(null, LocalDate.of(2026, 9, 4));

        assertThat(window.startDate()).isEqualTo(LocalDate.of(2026, 9, 1));
        assertThat(window.endDate()).isEqualTo(LocalDate.of(2026, 9, 30));
    }

    @Test
    void yearGetsTwelveMonthlyBuckets() {
        var year = PeriodResolver.resolve(PeriodType.YEAR, LocalDate.of(2026, 9, 4));

        List<PeriodResolver.Period> buckets = PeriodResolver.buckets(PeriodType.YEAR, year);
        assertThat(buckets).hasSize(12);
        assertThat(buckets.get(0).startDate()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(buckets.get(11).endDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    }

    @Test
    void monthAndWeekGetDailyBuckets() {
        var month = PeriodResolver.resolve(PeriodType.MONTH, LocalDate.of(2026, 9, 4));
        assertThat(PeriodResolver.buckets(PeriodType.MONTH, month)).hasSize(30);

        var week = PeriodResolver.resolve(PeriodType.WEEK, LocalDate.of(2026, 9, 4));
        assertThat(PeriodResolver.buckets(PeriodType.WEEK, week)).hasSize(7);
    }
}
