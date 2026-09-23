/**
 * tests/inventory.test.ts
 *
 * Unit tests for inventory valuation, low-stock detection, and delivery
 * line validation.
 */

import { describe, it, expect } from 'vitest';
import {
  extendedValue,
  totalInventoryValue,
  isLowStock,
  validateDeliveryLines,
} from '../src/modules/inventory/inventory-rules';

describe('extendedValue', () => {
  it('multiplies on-hand qty by cost', () => {
    expect(extendedValue({ onHandQty: 10, cost: 2.5, reorderPoint: null })).toBe(25);
  });

  it('treats a null cost as $0 rather than throwing', () => {
    expect(extendedValue({ onHandQty: 10, cost: null, reorderPoint: null })).toBe(0);
  });
});

describe('totalInventoryValue', () => {
  it('sums extended value across items', () => {
    const total = totalInventoryValue([
      { onHandQty: 10, cost: 2.5, reorderPoint: null },
      { onHandQty: 4, cost: 1.25, reorderPoint: null },
    ]);
    expect(total).toBe(30);
  });

  it('rounds to 2 decimal places', () => {
    const total = totalInventoryValue([
      { onHandQty: 3, cost: 0.1, reorderPoint: null },
      { onHandQty: 1, cost: 0.2, reorderPoint: null },
    ]);
    expect(total).toBe(0.5);
  });

  it('returns 0 for an empty list', () => {
    expect(totalInventoryValue([])).toBe(0);
  });
});

describe('isLowStock', () => {
  it('flags an item at or below its reorder point', () => {
    expect(isLowStock({ onHandQty: 5, cost: 1, reorderPoint: 5 })).toBe(true);
    expect(isLowStock({ onHandQty: 4, cost: 1, reorderPoint: 5 })).toBe(true);
  });

  it('does not flag an item above its reorder point', () => {
    expect(isLowStock({ onHandQty: 6, cost: 1, reorderPoint: 5 })).toBe(false);
  });

  it('never flags an item with no reorder point configured', () => {
    expect(isLowStock({ onHandQty: 0, cost: 1, reorderPoint: null })).toBe(false);
  });
});

describe('validateDeliveryLines', () => {
  it('accepts a well-formed set of lines', () => {
    const errors = validateDeliveryLines([
      { pluItemId: 'item-1', qty: 12, unitCost: 3.5 },
    ]);
    expect(errors).toEqual([]);
  });

  it('rejects an empty delivery', () => {
    const errors = validateDeliveryLines([]);
    expect(errors.length).toBe(1);
  });

  it('rejects a line with zero or negative quantity', () => {
    const errors = validateDeliveryLines([{ pluItemId: 'item-1', qty: 0, unitCost: 1 }]);
    expect(errors.some(e => e.message.includes('Quantity'))).toBe(true);
  });

  it('rejects a line with negative unit cost', () => {
    const errors = validateDeliveryLines([{ pluItemId: 'item-1', qty: 1, unitCost: -0.01 }]);
    expect(errors.some(e => e.message.includes('cost'))).toBe(true);
  });

  it('rejects a line missing an item', () => {
    const errors = validateDeliveryLines([{ pluItemId: '', qty: 1, unitCost: 1 }]);
    expect(errors.some(e => e.message.includes('item'))).toBe(true);
  });

  it('reports one error per invalid line, indexed', () => {
    const errors = validateDeliveryLines([
      { pluItemId: 'item-1', qty: 1, unitCost: 1 },
      { pluItemId: '', qty: -1, unitCost: 1 },
    ]);
    expect(errors.every(e => e.index === 1)).toBe(true);
    expect(errors.length).toBe(2);
  });
});
