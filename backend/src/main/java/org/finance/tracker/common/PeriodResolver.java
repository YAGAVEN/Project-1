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
            // Rolling report windows: exactly N months back from the anchor, ending on it
            case THREE_MONTHS -> new Period(day.minusMonths(3).plusDays(1), day);
            case SIX_MONTHS -> new Period(day.minusMonths(6).plusDays(1), day);
            case YEAR -> new Period(day.withDayOfYear(1), day.withDayOfYear(day.lengthOfYear()));
        };
    }

    /**
     * Trend buckets inside a window: monthly buckets for YEAR/THREE_MONTHS/
     * SIX_MONTHS, daily otherwise (backend.md §6.1 series granularity, §8.3
     * balance trend). Rolling windows get a partial first/last month bucket.
     */
    public static List<Period> buckets(PeriodType periodType, Period window) {
        List<Period> result = new ArrayList<>();
        if (periodType == PeriodType.YEAR || periodType == PeriodType.THREE_MONTHS
                || periodType == PeriodType.SIX_MONTHS) {
            YearMonth month = YearMonth.from(window.startDate());
            YearMonth last = YearMonth.from(window.endDate());
            while (!month.isAfter(last)) {
                LocalDate start = month.atDay(1).isBefore(window.startDate())
                        ? window.startDate()
                        : month.atDay(1);
                LocalDate end = month.atEndOfMonth().isAfter(window.endDate())
                        ? window.endDate()
                        : month.atEndOfMonth();
                result.add(new Period(start, end));
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
