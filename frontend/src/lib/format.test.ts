import { describe, expect, it } from 'vitest'
import { addDaysISO, addMonthsISO, formatDateLabel, formatINR, shiftAnchor, todayISO } from './format'

// Phase 2 audit fix (H-1/H-2): the previous implementations derived dates via
// toISOString (UTC). East-of-UTC users got misdated transactions between local
// midnight and 05:30 IST, a dead DAY "next" arrow, and month-end spill. These
// tests pin local-calendar semantics with an injectable clock, so they hold
// regardless of the machine timezone the suite runs in.

describe('todayISO', () => {
  it('uses the local calendar date, not the UTC date', () => {
    // 00:30 local on Jun 15 — the old code returned "2026-06-14" on UTC+ zones.
    expect(todayISO(new Date(2026, 5, 15, 0, 30))).toBe('2026-06-15')
  })

  it('rolls over exactly at local midnight', () => {
    expect(todayISO(new Date(2026, 5, 15, 23, 59, 59))).toBe('2026-06-15')
    expect(todayISO(new Date(2026, 5, 16, 0, 0, 0))).toBe('2026-06-16')
  })

  it('pads single-digit months and days', () => {
    expect(todayISO(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
})

describe('addDaysISO / addMonthsISO (pure date-string arithmetic)', () => {
  it('moves exactly one day — the old code mapped DAY +1 back onto itself in IST', () => {
    expect(addDaysISO('2026-10-12', 1)).toBe('2026-10-13')
    expect(addDaysISO('2026-10-12', -1)).toBe('2026-10-11')
  })

  it('crosses month and year boundaries cleanly', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles leap years in day math', () => {
    expect(addDaysISO('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDaysISO('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('clamps month-end overflow instead of spilling into the next month', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2024-01-31', 1)).toBe('2024-02-29') // leap year keeps the 29th
    expect(addMonthsISO('2026-01-30', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-03-31', -1)).toBe('2026-02-28')
  })

  it('preserves the day when the target month is long enough', () => {
    expect(addMonthsISO('2026-01-15', 1)).toBe('2026-02-15')
    expect(addMonthsISO('2026-05-15', -3)).toBe('2026-02-15')
  })

  it('wraps years correctly in both directions', () => {
    expect(addMonthsISO('2026-11-15', 2)).toBe('2027-01-15')
    expect(addMonthsISO('2026-02-15', -2)).toBe('2025-12-15')
  })

  it('clamps Feb 29 year-shifts onto Feb 28 of non-leap years', () => {
    expect(addMonthsISO('2024-02-29', 12)).toBe('2025-02-28')
  })
})

describe('shiftAnchor (period navigation)', () => {
  it('DAY navigation always changes the date — regression for the dead arrow', () => {
    expect(shiftAnchor('DAY', '2026-10-12', 1)).not.toBe('2026-10-12')
    expect(shiftAnchor('DAY', '2026-10-01', 1)).toBe('2026-10-02')
    expect(shiftAnchor('DAY', '2026-10-01', -1)).toBe('2026-09-30')
  })

  it('WEEK shifts exactly seven days so Monday anchors stay on Mondays', () => {
    // 2026-10-05 is a Monday
    expect(shiftAnchor('WEEK', '2026-10-05', 1)).toBe('2026-10-12')
    expect(shiftAnchor('WEEK', '2026-10-05', -1)).toBe('2026-09-28')
  })

  it('MONTH navigation clamps and does not drift', () => {
    expect(shiftAnchor('MONTH', '2026-10-12', 1)).toBe('2026-11-12')
    expect(shiftAnchor('MONTH', '2026-01-31', 1)).toBe('2026-02-28')
    // repeated navigation must be stable: +1 then −1 returns the clamped day
    expect(shiftAnchor('MONTH', shiftAnchor('MONTH', '2026-01-31', 1), -1)).toBe('2026-01-28')
  })

  it('rolling windows shift by their own span', () => {
    expect(shiftAnchor('THREE_MONTHS', '2026-10-12', -1)).toBe('2026-07-12')
    expect(shiftAnchor('THREE_MONTHS', '2026-11-15', 1)).toBe('2027-02-15')
    expect(shiftAnchor('SIX_MONTHS', '2026-10-12', -1)).toBe('2026-04-12')
    expect(shiftAnchor('SIX_MONTHS', '2026-09-30', 1)).toBe('2027-03-30')
  })

  it('YEAR navigation keeps Feb 29 realistic', () => {
    expect(shiftAnchor('YEAR', '2026-10-12', 1)).toBe('2027-10-12')
    expect(shiftAnchor('YEAR', '2024-02-29', 1)).toBe('2025-02-28')
  })
})

describe('formatDateLabel', () => {
  it('labels today and yesterday on the local calendar', () => {
    const now = new Date(2026, 9, 12, 10, 0) // local 2026-10-12 10:00
    expect(formatDateLabel('2026-10-12', now)).toBe('Today')
    expect(formatDateLabel('2026-10-11', now)).toBe('Yesterday')
    expect(formatDateLabel('2026-10-09', now)).toBe('9 Oct 2026')
  })
})

describe('formatINR', () => {
  it('formats INR and guards non-finite values', () => {
    expect(formatINR(123456.78)).toContain('1,23,456.78')
    expect(formatINR('123456.78')).toContain('1,23,456.78')
    expect(formatINR(Number.NaN)).toBe('—')
    expect(formatINR(Infinity)).toBe('—')
  })
})
