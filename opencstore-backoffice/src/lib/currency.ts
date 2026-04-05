/**
 * src/lib/currency.ts
 *
 * Formatting and arithmetic helpers for monetary values.
 * Always round to 2 decimal places using "round half away from zero"
 * (standard retail pricing convention).
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Format a number as USD: "$1,234.56" */
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return USD.format(n);
}

/** Format a decimal fraction as a percentage: "0.253 → 25.3%" */
export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return PCT.format(n);
}

/** Format a percentage number (already ×100) for display: "25.3" → "25.3%" */
export function fmtPctNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toFixed(1) + '%';
}

/** Round to 2 decimal places */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Gross profit dollars = retail - cost */
export function grossProfitDollars(retail: number, cost: number): number {
  return round2(retail - cost);
}

/** Gross margin percent (0–100) = (retail - cost) / retail × 100 */
export function grossMarginPct(retail: number, cost: number): number | null {
  if (!retail || retail <= 0) return null;
  return round2(((retail - cost) / retail) * 100);
}

/**
 * Apply a price-ending strategy.
 * Given a raw price, round up to the nearest acceptable ending.
 * endings: array of decimals e.g. [0.99, 0.49, 0.29, 0.09]
 */
export function applyPriceEnding(price: number, endings: number[] = [0.99, 0.49, 0.29, 0.09]): number {
  const base = Math.floor(price);
  for (const ending of endings.sort((a, b) => b - a)) {
    const candidate = round2(base + ending);
    if (candidate >= price) return candidate;
  }
  // Fallback: next highest .99
  return round2(Math.ceil(price) - 0.01);
}

/** Parse a string like "$3.49" or "3.49" to a number safely */
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : round2(n);
}
