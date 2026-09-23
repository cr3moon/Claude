/**
 * src/modules/stores/store-access.service.ts
 *
 * Renderer-side facade for multi-store IPC handlers. Mirrors the other
 * *.service.ts facades in this app.
 */

export interface AccessibleStore {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  timezone: string;
  tax_rate: number;
  fuel_tax_rate: number;
  isHome: boolean;
}

export interface StoreInput {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  timezone: string;
  tax_rate: number;
  fuel_tax_rate: number;
}

export interface StoreUserRow {
  id: string;
  username: string;
  display_name: string;
  role: string;
  store_id: string;
}

export interface MultiStoreSummaryRow {
  storeId: string;
  name: string;
  isHome: boolean;
  dashboard: {
    today_sales: number;
    pending_item_recommendations: number;
    pending_pricing_recommendations: number;
    low_margin_items: unknown[];
  };
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const StoreAccessService = {
  async listAccessible(): Promise<AccessibleStore[]> {
    return window.electronAPI.storeListAccessible() as Promise<AccessibleStore[]>;
  },

  async createStore(data: StoreInput): Promise<string> {
    const result = await window.electronAPI.storeCreate(data);
    return unwrap(result as Result<{ success: true; storeId: string }>).storeId;
  },

  async switchActive(storeId: string): Promise<void> {
    unwrap(await window.electronAPI.storeSwitchActive(storeId));
  },

  async grantAccess(userId: string, storeId: string): Promise<void> {
    unwrap(await window.electronAPI.storeGrantAccess({ userId, storeId }));
  },

  async revokeAccess(userId: string, storeId: string): Promise<void> {
    unwrap(await window.electronAPI.storeRevokeAccess({ userId, storeId }));
  },

  async listAllUsers(): Promise<StoreUserRow[]> {
    return window.electronAPI.storeListAllUsers() as Promise<StoreUserRow[]>;
  },

  async listAccessibleFor(userId: string): Promise<AccessibleStore[]> {
    return window.electronAPI.storeListAccessibleFor(userId) as Promise<AccessibleStore[]>;
  },

  async getMultiStoreSummary(): Promise<MultiStoreSummaryRow[]> {
    return window.electronAPI.storeGetMultiStoreSummary() as Promise<MultiStoreSummaryRow[]>;
  },
};
