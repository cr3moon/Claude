/**
 * src/modules/settings/store.service.ts
 *
 * Renderer-side facade for reading and editing the store record.
 * This is the single store row (name, address, tax rates, POS adapter type,
 * etc.) — distinct from `app_settings`, which holds arbitrary app-level
 * key/value config unrelated to the store itself.
 */

export interface StoreRecord {
  id:             string;
  name:           string;
  address:        string | null;
  city:           string | null;
  state:          string | null;
  zip:            string | null;
  phone:          string | null;
  timezone:       string;
  tax_rate:       number;
  fuel_tax_rate:  number;
  currency:       string;
  pos_type:       string | null;
}

export type StoreUpdate = Partial<Omit<StoreRecord, 'id' | 'currency'>>;

export const StoreService = {
  async get(): Promise<StoreRecord | undefined> {
    return window.electronAPI.getStore();
  },

  async update(data: StoreUpdate): Promise<{ success: boolean }> {
    return window.electronAPI.updateStore(data) as Promise<{ success: boolean }>;
  },
};
