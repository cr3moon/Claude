/**
 * InventoryService
 *
 * Vendor/delivery receiving and on-hand quantity tracking for the PLU
 * catalog. Receiving a delivery is the only path that increases
 * plu_items.on_hand_qty from a purchase (and writes a costs row, reusing
 * the existing cost-history table); inventory_adjustments covers manual
 * corrections (physical counts, shrink, waste, damage). Both are
 * append-only logs, mirroring price_change_history's audit-trail pattern —
 * on_hand_qty itself is a derived running total, never edited directly.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import {
  extendedValue,
  totalInventoryValue,
  isLowStock,
  validateDeliveryLines,
  ADJUSTMENT_REASON_CODES,
  type AdjustmentReasonCode,
  type DeliveryLineInput,
} from '../../src/modules/inventory/inventory-rules';

export interface VendorInput {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  accountNumber?: string;
  notes?: string;
}

export interface OnHandRow {
  plu_item_id: string;
  pos_plu_id: string;
  description: string;
  dept_name: string | null;
  on_hand_qty: number;
  cost: number | null;
  reorder_point: number | null;
  extended_value: number;
  low_stock: boolean;
}

export class InventoryService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  // ─── Vendors ────────────────────────────────────────────────────────────

  listVendors(storeId: string): unknown[] {
    return this.db.all(
      `SELECT * FROM vendors WHERE store_id=? AND is_active=1 ORDER BY name`,
      [storeId]
    );
  }

  createVendor(storeId: string, userId: string, data: VendorInput): string {
    if (!data.name?.trim()) throw new Error('Vendor name is required.');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO vendors(id,store_id,name,contact_name,phone,email,account_number,notes,is_active,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,1,?,?)`,
      [id, storeId, data.name.trim(), data.contactName ?? null, data.phone ?? null,
       data.email ?? null, data.accountNumber ?? null, data.notes ?? null, now, now]
    );
    this.audit.log({
      storeId, userId,
      eventType: 'inventory', eventSubtype: 'vendor_created',
      description: `Vendor "${data.name.trim()}" added.`,
    });
    return id;
  }

  // ─── Deliveries (receiving) ────────────────────────────────────────────

  createDelivery(storeId: string, userId: string, vendorId: string, invoiceNumber?: string, notes?: string): string {
    const vendor = this.db.get<{ id: string }>('SELECT id FROM vendors WHERE id=? AND store_id=?', [vendorId, storeId]);
    if (!vendor) throw new Error('Vendor not found.');
    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO deliveries(id,store_id,vendor_id,invoice_number,status,notes,created_by,created_at,updated_at)
       VALUES(?,?,?,?,'draft',?,?,?,?)`,
      [id, storeId, vendorId, invoiceNumber ?? null, notes ?? null, userId, now, now]
    );
    return id;
  }

  addDeliveryLine(deliveryId: string, storeId: string, line: DeliveryLineInput): void {
    const delivery = this.db.get<{ status: string }>(
      'SELECT status FROM deliveries WHERE id=? AND store_id=?', [deliveryId, storeId]
    );
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status !== 'draft') throw new Error('Only a draft delivery can be edited.');
    const [error] = validateDeliveryLines([line]);
    if (error) throw new Error(error.message);

    this.db.run(
      `INSERT INTO delivery_lines(id,delivery_id,plu_item_id,qty,unit_cost,created_at)
       VALUES(?,?,?,?,?,?)`,
      [uuidv4(), deliveryId, line.pluItemId, line.qty, line.unitCost, new Date().toISOString()]
    );
  }

  getDelivery(deliveryId: string, storeId: string): { delivery: unknown; lines: unknown[] } | null {
    const delivery = this.db.get(
      `SELECT d.*, v.name as vendor_name FROM deliveries d
       JOIN vendors v ON v.id = d.vendor_id
       WHERE d.id=? AND d.store_id=?`,
      [deliveryId, storeId]
    );
    if (!delivery) return null;
    const lines = this.db.all(
      `SELECT dl.*, p.pos_plu_id, p.description FROM delivery_lines dl
       JOIN plu_items p ON p.id = dl.plu_item_id
       WHERE dl.delivery_id=? ORDER BY dl.created_at`,
      [deliveryId]
    );
    return { delivery, lines };
  }

  listDeliveries(storeId: string): unknown[] {
    return this.db.all(
      `SELECT d.*, v.name as vendor_name,
              (SELECT COUNT(*) FROM delivery_lines WHERE delivery_id=d.id) as line_count
       FROM deliveries d JOIN vendors v ON v.id = d.vendor_id
       WHERE d.store_id=? ORDER BY d.created_at DESC`,
      [storeId]
    );
  }

  /**
   * Commits a draft delivery: validates every line, then in one transaction
   * bumps each item's on_hand_qty, writes a costs row per line (source
   * 'invoice', reusing the existing cost-history table), and marks the
   * delivery received. This is the only place a purchase increases
   * on_hand_qty — matches the rest of the app's backup/approve-before-write
   * pattern of an explicit commit step rather than live-editing quantities.
   */
  receiveDelivery(deliveryId: string, storeId: string, userId: string): void {
    const delivery = this.db.get<{ status: string; vendor_id: string }>(
      'SELECT status, vendor_id FROM deliveries WHERE id=? AND store_id=?', [deliveryId, storeId]
    );
    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.status !== 'draft') throw new Error(`Delivery is already ${delivery.status}.`);

    const lines = this.db.all<{ id: string; plu_item_id: string; qty: number; unit_cost: number }>(
      'SELECT id, plu_item_id, qty, unit_cost FROM delivery_lines WHERE delivery_id=?', [deliveryId]
    );
    const errors = validateDeliveryLines(lines.map(l => ({ pluItemId: l.plu_item_id, qty: l.qty, unitCost: l.unit_cost })));
    if (errors.length > 0) throw new Error(errors[0].message);

    const vendor = this.db.get<{ name: string }>('SELECT name FROM vendors WHERE id=?', [delivery.vendor_id]);
    const now = new Date().toISOString();

    this.db.transaction(() => {
      for (const line of lines) {
        this.db.run('UPDATE plu_items SET on_hand_qty = on_hand_qty + ?, cost = ?, updated_at=? WHERE id=?',
          [line.qty, line.unit_cost, now, line.plu_item_id]);
        this.db.run(
          `INSERT INTO costs(id,plu_item_id,store_id,unit_cost,vendor_name,pack_size,effective_date,source,created_at)
           VALUES(?,?,?,?,?,1,?,'invoice',?)`,
          [uuidv4(), line.plu_item_id, storeId, line.unit_cost, vendor?.name ?? null, now, now]
        );
      }
      this.db.run(
        `UPDATE deliveries SET status='received', received_by=?, received_at=?, updated_at=? WHERE id=?`,
        [userId, now, now, deliveryId]
      );
    });

    this.audit.log({
      storeId, userId,
      eventType: 'inventory', eventSubtype: 'delivery_received',
      description: `Delivery from ${vendor?.name ?? 'vendor'} received: ${lines.length} line item(s).`,
    });
  }

  // ─── Manual adjustments (physical counts, shrink, waste, damage) ──────

  createAdjustment(storeId: string, userId: string, pluItemId: string, qtyDelta: number, reasonCode: AdjustmentReasonCode, notes?: string): void {
    if (!ADJUSTMENT_REASON_CODES.includes(reasonCode)) throw new Error(`Unknown reason code: ${reasonCode}`);
    if (qtyDelta === 0) throw new Error('Adjustment quantity cannot be zero.');
    const item = this.db.get<{ id: string }>('SELECT id FROM plu_items WHERE id=? AND store_id=?', [pluItemId, storeId]);
    if (!item) throw new Error('Item not found.');

    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO inventory_adjustments(id,store_id,plu_item_id,qty_delta,reason_code,notes,created_by,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        [uuidv4(), storeId, pluItemId, qtyDelta, reasonCode, notes ?? null, userId, now]
      );
      this.db.run('UPDATE plu_items SET on_hand_qty = on_hand_qty + ?, updated_at=? WHERE id=?',
        [qtyDelta, now, pluItemId]);
    });

    this.audit.log({
      storeId, userId,
      eventType: 'inventory', eventSubtype: 'adjustment',
      description: `Inventory adjustment (${reasonCode}): ${qtyDelta > 0 ? '+' : ''}${qtyDelta} on item ${pluItemId}.`,
    });
  }

  // ─── On-hand / valuation queries ───────────────────────────────────────

  getOnHandLevels(storeId: string): OnHandRow[] {
    const rows = this.db.all<{
      plu_item_id: string; pos_plu_id: string; description: string; dept_name: string | null;
      on_hand_qty: number; cost: number | null; reorder_point: number | null;
    }>(
      `SELECT p.id as plu_item_id, p.pos_plu_id, p.description, d.name as dept_name,
              p.on_hand_qty, p.cost, p.reorder_point
       FROM plu_items p LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.store_id=? AND p.is_active=1
       ORDER BY p.description`,
      [storeId]
    );
    return rows.map(r => ({
      ...r,
      extended_value: extendedValue({ onHandQty: r.on_hand_qty, cost: r.cost, reorderPoint: r.reorder_point }),
      low_stock: isLowStock({ onHandQty: r.on_hand_qty, cost: r.cost, reorderPoint: r.reorder_point }),
    }));
  }

  getInventoryValuation(storeId: string): { totalValue: number; itemCount: number; lowStockCount: number } {
    const rows = this.getOnHandLevels(storeId);
    return {
      totalValue: totalInventoryValue(rows.map(r => ({ onHandQty: r.on_hand_qty, cost: r.cost, reorderPoint: r.reorder_point }))),
      itemCount: rows.length,
      lowStockCount: rows.filter(r => r.low_stock).length,
    };
  }
}
