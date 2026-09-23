/**
 * src/modules/inventory/inventory-rules.ts
 *
 * Pure inventory calculations: on-hand valuation, low-stock detection, and
 * delivery-line validation. No DB access — covered directly by unit tests;
 * backend/services/InventoryService.ts wraps these with the actual queries.
 */

export const ADJUSTMENT_REASON_CODES = [
  'physical_count',
  'shrink',
  'waste',
  'damage',
  'other',
] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASON_CODES)[number];

export interface InventoryItemLike {
  onHandQty: number;
  cost: number | null;
  reorderPoint: number | null;
}

/** Extended cost of on-hand stock for one item. Null cost values are treated as $0 — flags the gap rather than silently excluding the item from a total. */
export function extendedValue(item: InventoryItemLike): number {
  return item.onHandQty * (item.cost ?? 0);
}

/** Sum of extended value across a set of items. */
export function totalInventoryValue(items: InventoryItemLike[]): number {
  return round2(items.reduce((sum, item) => sum + extendedValue(item), 0));
}

/** True when on-hand quantity has dropped to or below the item's configured reorder point. Items with no reorder point set are never flagged. */
export function isLowStock(item: InventoryItemLike): boolean {
  return item.reorderPoint != null && item.onHandQty <= item.reorderPoint;
}

export interface DeliveryLineInput {
  pluItemId: string;
  qty: number;
  unitCost: number;
}

export interface DeliveryLineValidationError {
  index: number;
  message: string;
}

/** Validates delivery lines before a delivery can be received. Returns an empty array when the lines are valid. */
export function validateDeliveryLines(lines: DeliveryLineInput[]): DeliveryLineValidationError[] {
  const errors: DeliveryLineValidationError[] = [];
  if (lines.length === 0) {
    errors.push({ index: -1, message: 'A delivery needs at least one line item.' });
  }
  lines.forEach((line, index) => {
    if (!line.pluItemId) errors.push({ index, message: 'Line is missing an item.' });
    if (!(line.qty > 0)) errors.push({ index, message: 'Quantity must be greater than zero.' });
    if (!(line.unitCost >= 0)) errors.push({ index, message: 'Unit cost cannot be negative.' });
  });
  return errors;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
