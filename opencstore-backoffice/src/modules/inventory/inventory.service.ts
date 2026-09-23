/**
 * src/modules/inventory/inventory.service.ts
 *
 * Renderer-side facade for the Inventory & Receiving IPC handlers. Every
 * write returns either a success shape or { error } — never throws — so
 * pages can render the message inline the same way CommanderConnectionCard
 * does, rather than needing a try/catch around every call.
 */

import type { AdjustmentReasonCode } from './inventory-rules';

export interface Vendor {
  id: string;
  store_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  account_number: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface VendorInput {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  accountNumber?: string;
  notes?: string;
}

export interface Delivery {
  id: string;
  store_id: string;
  vendor_id: string;
  vendor_name: string;
  invoice_number: string | null;
  status: 'draft' | 'received' | 'voided';
  notes: string | null;
  received_at: string | null;
  created_at: string;
  line_count?: number;
}

export interface DeliveryLine {
  id: string;
  delivery_id: string;
  plu_item_id: string;
  pos_plu_id: string;
  description: string;
  qty: number;
  unit_cost: number;
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

export interface InventoryValuation {
  totalValue: number;
  itemCount: number;
  lowStockCount: number;
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const InventoryService = {
  async listVendors(): Promise<Vendor[]> {
    return window.electronAPI.inventoryListVendors() as Promise<Vendor[]>;
  },

  async createVendor(data: VendorInput): Promise<string> {
    const result = await window.electronAPI.inventoryCreateVendor(data);
    return unwrap(result as Result<{ success: true; id: string }>).id;
  },

  async createDelivery(vendorId: string, invoiceNumber?: string, notes?: string): Promise<string> {
    const result = await window.electronAPI.inventoryCreateDelivery({ vendorId, invoiceNumber, notes });
    return unwrap(result as Result<{ success: true; id: string }>).id;
  },

  async addDeliveryLine(deliveryId: string, line: { pluItemId: string; qty: number; unitCost: number }): Promise<void> {
    unwrap(await window.electronAPI.inventoryAddDeliveryLine({ deliveryId, line }));
  },

  async getDelivery(deliveryId: string): Promise<{ delivery: Delivery; lines: DeliveryLine[] } | null> {
    return window.electronAPI.inventoryGetDelivery(deliveryId) as Promise<{ delivery: Delivery; lines: DeliveryLine[] } | null>;
  },

  async listDeliveries(): Promise<Delivery[]> {
    return window.electronAPI.inventoryListDeliveries() as Promise<Delivery[]>;
  },

  async receiveDelivery(deliveryId: string): Promise<void> {
    unwrap(await window.electronAPI.inventoryReceiveDelivery(deliveryId));
  },

  async createAdjustment(pluItemId: string, qtyDelta: number, reasonCode: AdjustmentReasonCode, notes?: string): Promise<void> {
    unwrap(await window.electronAPI.inventoryCreateAdjustment({ pluItemId, qtyDelta, reasonCode, notes }));
  },

  async getOnHandLevels(): Promise<OnHandRow[]> {
    return window.electronAPI.inventoryGetOnHandLevels() as Promise<OnHandRow[]>;
  },

  async getValuation(): Promise<InventoryValuation> {
    return window.electronAPI.inventoryGetValuation();
  },
};
