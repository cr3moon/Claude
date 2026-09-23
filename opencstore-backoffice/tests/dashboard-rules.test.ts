/**
 * tests/dashboard-rules.test.ts
 *
 * Unit tests for dashboard date-range/trend-shaping helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  daysInRange,
  fillMissingDays,
  foldIntoTopCategories,
  validateSalesEntryAmount,
} from '../src/modules/dashboard/dashboard-rules';

describe('daysInRange', () => {
  it('returns a single day for a same-day range', () => {
    expect(daysInRange('2026-09-01', '2026-09-01')).toEqual(['2026-09-01']);
  });

  it('returns every day inclusive', () => {
    expect(daysInRange('2026-09-01', '2026-09-04')).toEqual([
      '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04',
    ]);
  });

  it('crosses a month boundary correctly', () => {
    expect(daysInRange('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02',
    ]);
  });

  it('rejects a start after the end', () => {
    expect(() => daysInRange('2026-09-05', '2026-09-01')).toThrow();
  });
});

describe('fillMissingDays', () => {
  it('fills gaps with zero', () => {
    const result = fillMissingDays([{ date: '2026-09-01', value: 10 }], '2026-09-01', '2026-09-03');
    expect(result).toEqual([
      { date: '2026-09-01', value: 10 },
      { date: '2026-09-02', value: 0 },
      { date: '2026-09-03', value: 0 },
    ]);
  });

  it('handles an empty input', () => {
    const result = fillMissingDays([], '2026-09-01', '2026-09-02');
    expect(result).toEqual([
      { date: '2026-09-01', value: 0 },
      { date: '2026-09-02', value: 0 },
    ]);
  });
});

describe('foldIntoTopCategories', () => {
  it('passes through when under the cap', () => {
    const items = [{ category: 'A', value: 10 }, { category: 'B', value: 5 }];
    expect(foldIntoTopCategories(items, 8)).toEqual([
      { category: 'A', value: 10 }, { category: 'B', value: 5 },
    ]);
  });

  it('sorts descending by value', () => {
    const items = [{ category: 'A', value: 1 }, { category: 'B', value: 9 }];
    expect(foldIntoTopCategories(items, 8)[0].category).toBe('B');
  });

  it('folds the remainder into Other when over the cap', () => {
    const items = [
      { category: 'A', value: 10 }, { category: 'B', value: 8 }, { category: 'C', value: 6 },
      { category: 'D', value: 4 }, { category: 'E', value: 2 },
    ];
    const result = foldIntoTopCategories(items, 3);
    expect(result).toEqual([
      { category: 'A', value: 10 },
      { category: 'B', value: 8 },
      { category: 'Other', value: 12 }, // C + D + E
    ]);
  });
});

describe('validateSalesEntryAmount', () => {
  it('accepts zero and positive amounts', () => {
    expect(() => validateSalesEntryAmount(0)).not.toThrow();
    expect(() => validateSalesEntryAmount(123.45)).not.toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => validateSalesEntryAmount(-1)).toThrow();
  });

  it('rejects NaN/Infinity', () => {
    expect(() => validateSalesEntryAmount(NaN)).toThrow();
    expect(() => validateSalesEntryAmount(Infinity)).toThrow();
  });
});
