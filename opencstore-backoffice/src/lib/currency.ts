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
 * Given a raw price, snap to the nearest acceptable ending (considering
 * both the current and next dollar amount, since the nearest ending to
 * e.g. $1.97 is $1.99, not something in the $2 range).
 * endings: array of decimals e.g. [0.99, 0.49, 0.29, 0.09]
 */
export function applyPriceEnding(price: number, endings: number[] = [0.99, 0.49, 0.29, 0.09]): number {
  const base = Math.floor(price);
  const candidates = [
    ...endings.map(e => round2(base + e)),
    ...endings.map(e => round2(base + 1 + e)),
  ];

  let best = candidates[0];
  let bestDiff = Math.abs(best - price);
  for (const candidate of candidates) {
    const diff = Math.abs(candidate - price);
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

/** Parse a string like "$3.49" or "3.49" to a number safely */
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : round2(n);
}
