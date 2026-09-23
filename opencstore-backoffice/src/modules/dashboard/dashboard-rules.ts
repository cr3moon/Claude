/**
 * src/modules/dashboard/dashboard-rules.ts
 *
 * Pure date-range and trend-shaping helpers for the dashboard's charts,
 * plus manual-entry validation. No DB access — covered directly by unit
 * tests; the backend services wrap these with the actual queries.
 */

/** Every 'YYYY-MM-DD' date from start to end, inclusive. */
export function daysInRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (cur > end) throw new Error('startDate must not be after endDate.');
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export interface DayValue {
  date: string;
  value: number;
}

/** Zero-fills any day in the range missing from `points`, so a trend line/bars never skip a day. */
export function fillMissingDays(points: DayValue[], startDate: string, endDate: string): DayValue[] {
  const byDate = new Map(points.map(p => [p.date, p.value]));
  return daysInRange(startDate, endDate).map(date => ({ date, value: byDate.get(date) ?? 0 }));
}

export interface CategoryValue {
  category: string;
  value: number;
}

/**
 * Keeps the top N categories by value and folds the rest into a single
 * "Other" bucket, since the validated categorical palette only guarantees
 * distinct colors for a bounded number of series.
 */
export function foldIntoTopCategories(items: CategoryValue[], maxCategories: number): CategoryValue[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length <= maxCategories) return sorted;
  const top = sorted.slice(0, maxCategories - 1);
  const otherValue = sorted.slice(maxCategories - 1).reduce((sum, c) => sum + c.value, 0);
  return [...top, { category: 'Other', value: otherValue }];
}

export function validateSalesEntryAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be zero or a positive number.');
  }
}
