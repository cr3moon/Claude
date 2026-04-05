/**
 * tests/pricing-engine.test.ts
 *
 * Unit tests for pricing rules, margin calculations, and price ending logic.
 * Run with: npx vitest run tests/pricing-engine.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  DEPT_MARGIN_RULES,
  FALLBACK_MARGIN,
  resolveDeptRule,
} from '../src/modules/pricing/pricing-rules';
import {
  marginImpact,
} from '../src/modules/pricing/pricing-engine.service';
import { applyPriceEnding, grossMarginPct, round2 } from '../src/lib/currency';

// ─── resolveDeptRule ─────────────────────────────────────────────────────

describe('resolveDeptRule', () => {
  it('returns a rule for well-known departments', () => {
    const rule = resolveDeptRule('BEVERAGES');
    expect(rule).toBeDefined();
    expect(rule.targetMarginPct).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    const lower = resolveDeptRule('beverages');
    const upper = resolveDeptRule('BEVERAGES');
    expect(lower.targetMarginPct).toBe(upper.targetMarginPct);
  });

  it('returns FALLBACK_MARGIN for unknown department', () => {
    const rule = resolveDeptRule('TOTALLY_UNKNOWN_DEPT_XYZ');
    expect(rule.targetMarginPct).toBe(FALLBACK_MARGIN.targetMarginPct);
  });

  it('DEPT_MARGIN_RULES has at least 8 entries', () => {
    expect(DEPT_MARGIN_RULES.length).toBeGreaterThanOrEqual(8);
  });

  it('all rules have targetMarginPct between 0 and 100', () => {
    for (const rule of DEPT_MARGIN_RULES) {
      expect(rule.targetMarginPct).toBeGreaterThan(0);
      expect(rule.targetMarginPct).toBeLessThan(100);
    }
  });
});

// ─── applyPriceEnding (via suggestRetail logic) ──────────────────────────

describe('Pricing: target margin calculation', () => {
  it('achieves approximately the target margin for tobacco', () => {
    const cost   = 8.09;
    const rule   = resolveDeptRule('TOBACCO');
    // Simulate the suggest logic: cost / (1 - targetMarginPct/100)
    const rawPrice = cost / (1 - rule.targetMarginPct / 100);
    const suggested = applyPriceEnding(rawPrice);
    const margin = grossMarginPct(suggested, cost) ?? 0; // already 0-100
    // Allow ±5% tolerance for price ending rounding
    expect(margin).toBeGreaterThanOrEqual(rule.targetMarginPct - 5);
  });

  it('applyPriceEnding always returns price > cost for typical items', () => {
    const costs = [0.69, 0.89, 1.00, 2.09, 8.09];
    for (const cost of costs) {
      const rawPrice = cost / (1 - 0.35); // 35% margin
      const suggested = applyPriceEnding(rawPrice);
      expect(suggested).toBeGreaterThan(cost);
    }
  });
});

// ─── marginImpact ────────────────────────────────────────────────────────

describe('marginImpact', () => {
  it('returns positive delta when new price is higher', () => {
    const impact = marginImpact(1.00, 1.99, 2.49);
    expect(impact.deltaMarginPct).toBeGreaterThan(0);
  });

  it('returns negative delta when new price is lower', () => {
    const impact = marginImpact(1.00, 1.99, 1.49);
    expect(impact.deltaMarginPct).toBeLessThan(0);
  });

  it('returns zero delta when prices are equal', () => {
    const impact = marginImpact(1.00, 1.99, 1.99);
    expect(impact.deltaMarginPct).toBeCloseTo(0);
  });

  it('includes both old and new margin values', () => {
    const impact = marginImpact(0.89, 1.99, 2.29);
    expect(impact.oldMarginPct).toBeDefined();
    expect(impact.newMarginPct).toBeDefined();
    expect(impact.newMarginPct).toBeGreaterThan(impact.oldMarginPct as number);
  });
});

// ─── applyPriceEnding ────────────────────────────────────────────────────

describe('applyPriceEnding', () => {
  it('rounds $1.52 to $1.49', () => {
    expect(applyPriceEnding(1.52)).toBe(1.49);
  });

  it('rounds $1.97 to $1.99', () => {
    expect(applyPriceEnding(1.97)).toBe(1.99);
  });

  it('returns a finite number for any positive price', () => {
    for (const p of [0.10, 0.55, 1.00, 2.50, 10.00, 99.99]) {
      expect(isFinite(applyPriceEnding(p))).toBe(true);
    }
  });

  it('never goes below cost floor (stays positive)', () => {
    const result = applyPriceEnding(0.15);
    expect(result).toBeGreaterThan(0);
  });
});

// ─── grossMarginPct ──────────────────────────────────────────────────────

describe('grossMarginPct', () => {
  it('calculates 50% margin correctly', () => {
    expect(grossMarginPct(2.00, 1.00)).toBeCloseTo(50);
  });

  it('returns 0 when price equals cost (break-even)', () => {
    expect(grossMarginPct(1.00, 1.00)).toBeCloseTo(0);
  });

  it('returns negative margin when selling below cost', () => {
    expect(grossMarginPct(0.80, 1.00)).toBeLessThan(0);
  });

  it('handles very small margins without NaN', () => {
    const result = grossMarginPct(1.01, 1.00);
    expect(result).not.toBeNull();
    expect(isNaN(result as number)).toBe(false);
  });
});

// ─── round2 ──────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 2);
    expect(round2(1.004)).toBeCloseTo(1.00, 2);
  });

  it('handles negative numbers', () => {
    expect(round2(-1.005)).toBeCloseTo(-1.0, 2);
  });

  it('handles zero', () => {
    expect(round2(0)).toBe(0);
  });
});
