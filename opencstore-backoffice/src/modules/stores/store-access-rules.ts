/**
 * src/modules/stores/store-access-rules.ts
 *
 * Pure multi-store access logic: which stores a user can reach (their home
 * store, always, plus anything explicitly granted), and what a grant can't
 * touch. No DB access — covered directly by unit tests;
 * backend/services/StoreAccessService.ts wraps these with the actual
 * queries.
 */

/** A user's accessible stores: their home store first, then any granted stores, deduplicated. */
export function mergeAccessibleStores(homeStoreId: string, grantedStoreIds: string[]): string[] {
  const seen = new Set([homeStoreId]);
  const merged = [homeStoreId];
  for (const id of grantedStoreIds) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

export function canAccessStore(homeStoreId: string, grantedStoreIds: string[], targetStoreId: string): boolean {
  return mergeAccessibleStores(homeStoreId, grantedStoreIds).includes(targetStoreId);
}

/** A user's home store is structural (set at account creation), not a grant — it can never be revoked here. */
export function canRevokeAccess(storeId: string, homeStoreId: string): boolean {
  return storeId !== homeStoreId;
}
