import { describe, it, expect } from 'vitest';
import { buildVarianceRows, findPeriodsForDate } from '../src/modules/reconciliation/reconciliation-rules';
import type { CommanderReportPeriod } from '../integrations/commander/ruby-report-parser';

describe('buildVarianceRows', () => {
  it('computes variance for a matching label on both sides', () => {
    const rows = buildVarianceRows(
      [{ label: 'Cigarettes', value: 100 }],
      [{ label: 'CIGARETTES', value: 112.5 }]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Cigarettes', manual: 100, commander: 112.5, variance: 12.5 });
  });

  it('matches labels case-insensitively and ignoring surrounding whitespace', () => {
    const rows = buildVarianceRows(
      [{ label: '  grocery  ', value: 50 }],
      [{ label: 'GROCERY', value: 50 }]
    );
    expect(rows[0].variance).toBe(0);
  });

  it('includes a manual-only entry with commander reported as 0', () => {
    const rows = buildVarianceRows([{ label: 'Lottery', value: 40 }], []);
    expect(rows).toEqual([{ label: 'Lottery', manual: 40, commander: 0, variance: -40 }]);
  });

  it('includes a commander-only entry with manual reported as 0', () => {
    const rows = buildVarianceRows([], [{ label: 'Fountain', value: 25 }]);
    expect(rows).toEqual([{ label: 'Fountain', manual: 0, commander: 25, variance: 25 }]);
  });

  it('sorts rows alphabetically by label', () => {
    const rows = buildVarianceRows(
      [{ label: 'Tobacco', value: 1 }, { label: 'AB Beverages', value: 1 }],
      []
    );
    expect(rows.map((r) => r.label)).toEqual(['AB Beverages', 'Tobacco']);
  });

  it('does not double-count a label present on both sides', () => {
    const rows = buildVarianceRows(
      [{ label: 'Coke', value: 10 }],
      [{ label: 'Coke', value: 12 }]
    );
    expect(rows).toHaveLength(1);
  });
});

describe('findPeriodsForDate', () => {
  const periods: CommanderReportPeriod[] = [
    { periodType: 2, name: '2026-07-17.312', desc: 'DAILY-312', filename: '2026-07-17.312', period: '2' },
    { periodType: 1, name: '2026-07-17.390', desc: 'SHIFT-390', filename: '2026-07-17.390', period: '1' },
    { periodType: 1, name: '2026-07-17.391', desc: 'SHIFT-391', filename: '2026-07-17.391', period: '1' },
    { periodType: 2, name: 'current', desc: 'Current DAILY', filename: 'current', period: '2' },
    { periodType: 1, name: 'current', desc: 'Current SHIFT', filename: 'current', period: '1' },
  ];

  it('finds the single closed DAILY period for a past date', () => {
    const found = findPeriodsForDate(periods, 2, '2026-07-17', '2026-07-18');
    expect(found).toHaveLength(1);
    expect(found[0].filename).toBe('2026-07-17.312');
  });

  it('finds multiple closed SHIFT periods for the same date', () => {
    const found = findPeriodsForDate(periods, 1, '2026-07-17', '2026-07-18');
    expect(found.map((p) => p.filename)).toEqual(['2026-07-17.390', '2026-07-17.391']);
  });

  it('falls back to the current period only when the date is today', () => {
    const found = findPeriodsForDate(periods, 2, '2026-07-18', '2026-07-18');
    expect(found).toHaveLength(1);
    expect(found[0].filename).toBe('current');
  });

  it('does not fall back to current for a past date with no closed match', () => {
    const found = findPeriodsForDate(periods, 2, '2026-07-16', '2026-07-18');
    expect(found).toHaveLength(0);
  });

  it('never matches a period of the wrong type', () => {
    const found = findPeriodsForDate(periods, 2, '2026-07-17', '2026-07-18');
    expect(found.every((p) => p.periodType === 2)).toBe(true);
  });
});
