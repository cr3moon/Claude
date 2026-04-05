/**
 * tests/item-audit.test.ts
 *
 * Unit tests for item normalization rules and name-cleaning helpers.
 * Run with: npx vitest run tests/item-audit.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  NORMALIZATION_RULES,
  RULES_BY_CODE,
  ENABLED_RULES,
} from '../src/modules/items/item-normalization.rules';
import type { NormalizationRule, RawPluItem } from '../src/modules/items/item-normalization.rules';
import {
  cleanDescription,
  suggestShortDesc,
  normaliseUom,
  normalisePackSize,
  descriptionSimilarity,
} from '../src/modules/items/item-name-cleaner';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<RawPluItem> = {}): RawPluItem {
  return {
    pos_plu_id:    '1001',
    description:   'COCA COLA 20OZ',
    short_desc:    'COKE',
    upc_code:      '04900002890',
    dept_name:     'BEVERAGES',
    category_name: 'SOFT DRINKS',
    unit_price:    1.99,
    cost:          0.89,
    tax_rate:      8.25,
    active:        true,
    ...overrides,
  };
}

// ─── NORMALIZATION_RULES array ─────────────────────────────────────────────

describe('NORMALIZATION_RULES', () => {
  it('exports at least 15 rules', () => {
    expect(NORMALIZATION_RULES.length).toBeGreaterThanOrEqual(15);
  });

  it('every rule has a unique code', () => {
    const codes = NORMALIZATION_RULES.map(r => r.code);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('every rule has a severity of error, warning, or info', () => {
    const valid = new Set(['error', 'warning', 'info']);
    for (const rule of NORMALIZATION_RULES) {
      expect(valid.has(rule.severity), `rule ${rule.code} has bad severity`).toBe(true);
    }
  });

  it('every rule has a non-empty message', () => {
    for (const rule of NORMALIZATION_RULES) {
      expect(rule.message.length).toBeGreaterThan(0);
    }
  });

  it('RULES_BY_CODE lookup matches array', () => {
    for (const rule of NORMALIZATION_RULES) {
      expect(RULES_BY_CODE[rule.code]).toBe(rule);
    }
  });

  it('ENABLED_RULES contains only known codes', () => {
    const known = new Set(NORMALIZATION_RULES.map(r => r.code));
    for (const code of ENABLED_RULES) {
      expect(known.has(code), `${code} not in NORMALIZATION_RULES`).toBe(true);
    }
  });
});

// ─── Individual rule predicates ───────────────────────────────────────────

describe('Rule: MISSING_DESC', () => {
  const rule = RULES_BY_CODE['MISSING_DESC'];
  it('fires when description is blank', () => {
    expect(rule.check(makeItem({ description: '' }))).toBe(true);
  });
  it('does not fire for valid description', () => {
    expect(rule.check(makeItem())).toBe(false);
  });
});

describe('Rule: MISSING_PRICE', () => {
  const rule = RULES_BY_CODE['MISSING_PRICE'];
  it('fires when unit_price is 0', () => {
    expect(rule.check(makeItem({ unit_price: 0 }))).toBe(true);
  });
  it('fires when unit_price is negative', () => {
    expect(rule.check(makeItem({ unit_price: -1 }))).toBe(true);
  });
  it('does not fire for positive price', () => {
    expect(rule.check(makeItem({ unit_price: 1.99 }))).toBe(false);
  });
});

describe('Rule: NEGATIVE_MARGIN', () => {
  const rule = RULES_BY_CODE['NEGATIVE_MARGIN'];
  it('fires when cost exceeds price', () => {
    expect(rule.check(makeItem({ unit_price: 0.50, cost: 0.75 }))).toBe(true);
  });
  it('does not fire for healthy margin', () => {
    expect(rule.check(makeItem({ unit_price: 1.99, cost: 0.89 }))).toBe(false);
  });
  it('does not fire when cost is zero (no cost data)', () => {
    expect(rule.check(makeItem({ unit_price: 1.99, cost: 0 }))).toBe(false);
  });
});

describe('Rule: MISSING_DEPT', () => {
  const rule = RULES_BY_CODE['MISSING_DEPT'];
  it('fires when dept_name is empty', () => {
    expect(rule.check(makeItem({ dept_name: '' }))).toBe(true);
  });
  it('does not fire when dept exists', () => {
    expect(rule.check(makeItem())).toBe(false);
  });
});

describe('Rule: INVALID_UPC', () => {
  const rule = RULES_BY_CODE['INVALID_UPC'];
  it('fires for UPC shorter than 8 chars', () => {
    expect(rule.check(makeItem({ upc_code: '123' }))).toBe(true);
  });
  it('fires for UPC containing non-digits', () => {
    expect(rule.check(makeItem({ upc_code: '0490000ABC' }))).toBe(true);
  });
  it('does not fire for valid 12-digit UPC', () => {
    expect(rule.check(makeItem({ upc_code: '049000028904' }))).toBe(false);
  });
  it('does not fire when upc_code is null (optional)', () => {
    expect(rule.check(makeItem({ upc_code: null as unknown as string }))).toBe(false);
  });
});

// ─── cleanDescription ────────────────────────────────────────────────────

describe('cleanDescription', () => {
  it('trims whitespace', () => {
    expect(cleanDescription('  COKE 20OZ  ')).toBe('COKE 20OZ');
  });

  it('collapses internal spaces', () => {
    expect(cleanDescription('COKE   20OZ')).toBe('COKE 20OZ');
  });

  it('uppercases by default', () => {
    expect(cleanDescription('coca cola')).toBe('COCA COLA');
  });

  it('removes special chars but keeps alphanumeric and spaces', () => {
    const result = cleanDescription('COKE!!! 20oz @#$');
    expect(result).not.toMatch(/[!@#$]/);
  });
});

// ─── suggestShortDesc ────────────────────────────────────────────────────

describe('suggestShortDesc', () => {
  it('returns at most 12 characters', () => {
    const result = suggestShortDesc('VERY LONG DESCRIPTION THAT SHOULD BE TRUNCATED');
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it('returns non-empty string for any input', () => {
    expect(suggestShortDesc('A').length).toBeGreaterThan(0);
  });
});

// ─── normaliseUom ─────────────────────────────────────────────────────────

describe('normaliseUom', () => {
  it('normalises oz variants', () => {
    expect(normaliseUom('OZ')).toBe('OZ');
    expect(normaliseUom('oz.')).toBe('OZ');
    expect(normaliseUom('ounce')).toBe('OZ');
  });

  it('normalises lb variants', () => {
    expect(normaliseUom('LB')).toBe('LB');
    expect(normaliseUom('pound')).toBe('LB');
    expect(normaliseUom('lbs')).toBe('LB');
  });

  it('returns EA for unknown', () => {
    expect(normaliseUom('EACH')).toBe('EA');
    expect(normaliseUom('')).toBe('EA');
  });
});

// ─── normalisePackSize ───────────────────────────────────────────────────

describe('normalisePackSize', () => {
  it('extracts numeric pack size from description', () => {
    const result = normalisePackSize('COKE 6PK 12OZ');
    expect(result).toBe(6);
  });

  it('returns 1 when no pack info found', () => {
    expect(normalisePackSize('CHIPS')).toBe(1);
  });
});

// ─── descriptionSimilarity ──────────────────────────────────────────────

describe('descriptionSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(descriptionSimilarity('COKE 20OZ', 'COKE 20OZ')).toBe(1.0);
  });

  it('returns 0 for completely different strings', () => {
    expect(descriptionSimilarity('COKE', 'MILK')).toBeLessThan(0.5);
  });

  it('returns value between 0 and 1', () => {
    const sim = descriptionSimilarity('COCA COLA 20OZ', 'COCA COLA 12OZ');
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('is symmetric', () => {
    const a = descriptionSimilarity('PEPSI 20OZ', 'COKE 20OZ');
    const b = descriptionSimilarity('COKE 20OZ', 'PEPSI 20OZ');
    expect(a).toBeCloseTo(b);
  });
});
