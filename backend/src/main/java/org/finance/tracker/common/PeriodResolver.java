package org.finance.tracker.common;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Converts a period selector into a half-open query window (backend.md §6.1).
 * All windows are computed in Asia/Kolkata. endDate is inclusive for display;
 * queries use [startDate, endDate.plusDays(1)).
 */
public final class PeriodResolver {

    public static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    /** Matches the `window` shape in API responses (e.g. budgets, summary). */
    public record Period(LocalDate startDate, LocalDate endDate) {
    }

    private PeriodResolver() {
    }

    public static Period resolve(PeriodType periodType, LocalDate anchor) {
        PeriodType type = periodType == null ? PeriodType.MONTH : periodType;
        LocalDate day = anchor == null ? LocalDate.now(ZONE) : anchor;

        return switch (type) {
            case DAY -> new Period(day, day);
            case WEEK -> new Period(day.with(DayOfWeek.MONDAY), day.with(DayOfWeek.SUNDAY));
            case MONTH -> new Period(day.withDayOfMonth(1), day.withDayOfMonth(day.lengthOfMonth()));
            case YEAR -> new Period(day.withDayOfYear(1), day.withDayOfYear(day.lengthOfYear()));
        };
    }

    /**
     * Trend buckets inside a window: monthly buckets for YEAR, daily otherwise
     * (backend.md §6.1 series granularity, §8.3 balance trend).
     */
    public static List<Period> buckets(PeriodType periodType, Period window) {
        List<Period> result = new ArrayList<>();
        if (periodType == PeriodType.YEAR) {
            YearMonth month = YearMonth.from(window.startDate());
            for (int i = 0; i < 12; i++) {
                result.add(new Period(month.atDay(1), month.atEndOfMonth()));
                month = month.plusMonths(1);
            }
        } else {
            for (LocalDate day = window.startDate(); !day.isAfter(window.endDate()); day = day.plusDays(1)) {
                result.add(new Period(day, day));
            }
        }
        return result;
    }
}
