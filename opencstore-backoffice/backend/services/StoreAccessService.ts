/**
 * StoreAccessService
 *
 * Multi-store support for a single install: creating additional locations,
 * granting/revoking a user's access to a store beyond their home store
 * (users.store_id), and switching which store the current session is
 * looking at. All stores and users in one install belong to the same
 * operator by construction — there's no cross-tenant concept to guard
 * against here, just "does this user have a reason to see this store".
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { mergeAccessibleStores, canAccessStore, canRevokeAccess } from '../../src/modules/stores/store-access-rules';

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

export class StoreAccessService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  private getHomeStoreId(userId: string): string {
    const row = this.db.get<{ store_id: string }>('SELECT store_id FROM users WHERE id=?', [userId]);
    if (!row) throw new Error('User not found.');
    return row.store_id;
  }

  private getGrantedStoreIds(userId: string): string[] {
    return this.db.all<{ store_id: string }>(
      'SELECT store_id FROM user_store_access WHERE user_id=?', [userId]
    ).map(r => r.store_id);
  }

  /** Every store this user can see: their home store plus anything granted, each with an isHome flag. */
  listAccessibleStores(userId: string): unknown[] {
    const homeStoreId = this.getHomeStoreId(userId);
    const ids = mergeAccessibleStores(homeStoreId, this.getGrantedStoreIds(userId));
    const stores = this.db.listStores(ids);
    return stores.map(s => ({ ...s, isHome: (s as { id: string }).id === homeStoreId }));
  }

  /** Creates a new location and immediately grants the creating user access to it. */
  createStore(userId: string, data: StoreInput): string {
    if (!data.name?.trim()) throw new Error('Store name is required.');
    const storeId = this.db.createStore(data);
    this.grantAccess(userId, storeId, userId);
    this.audit.log({
      storeId, userId,
      eventType: 'store', eventSubtype: 'store_created',
      description: `New location "${data.name.trim()}" added.`,
    });
    return storeId;
  }

  /** Grants a user access to a store beyond their home store. grantedBy is who's performing the grant. */
  grantAccess(userId: string, storeId: string, grantedBy: string): void {
    const store = this.db.get<{ id: string }>('SELECT id FROM stores WHERE id=?', [storeId]);
    if (!store) throw new Error('Store not found.');
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO user_store_access(id,user_id,store_id,granted_by,created_at)
       VALUES(?,?,?,?,?) ON CONFLICT(user_id,store_id) DO NOTHING`,
      [uuidv4(), userId, storeId, grantedBy, now]
    );
    this.audit.log({
      storeId, userId: grantedBy,
      eventType: 'store', eventSubtype: 'access_granted',
      description: `Granted user ${userId} access to store ${storeId}.`,
    });
  }

  revokeAccess(userId: string, storeId: string, revokedBy: string): void {
    const homeStoreId = this.getHomeStoreId(userId);
    if (!canRevokeAccess(storeId, homeStoreId)) {
      throw new Error("Can't revoke access to a user's home store.");
    }
    this.db.run('DELETE FROM user_store_access WHERE user_id=? AND store_id=?', [userId, storeId]);
    this.audit.log({
      storeId, userId: revokedBy,
      eventType: 'store', eventSubtype: 'access_revoked',
      description: `Revoked user ${userId}'s access to store ${storeId}.`,
    });
  }

  /** Validates the user actually has access before returning the store id to switch the session to. */
  validateSwitch(userId: string, targetStoreId: string): string {
    const homeStoreId = this.getHomeStoreId(userId);
    if (!canAccessStore(homeStoreId, this.getGrantedStoreIds(userId), targetStoreId)) {
      throw new Error("You don't have access to that store.");
    }
    return targetStoreId;
  }

  listAllUsers(): unknown[] {
    return this.db.all('SELECT id, username, display_name, role, store_id FROM users WHERE is_active=1 ORDER BY display_name');
  }

  /** Combined dashboard + inventory snapshot for every store this user can access, for the multi-store view. */
  getMultiStoreSummary(userId: string): unknown[] {
    const homeStoreId = this.getHomeStoreId(userId);
    const storeIds = mergeAccessibleStores(homeStoreId, this.getGrantedStoreIds(userId));
    const stores = this.db.listStores(storeIds) as { id: string; name: string }[];
    return stores.map(s => ({
      storeId: s.id,
      name: s.name,
      isHome: s.id === homeStoreId,
      dashboard: this.db.getDashboardSummary(s.id),
    }));
  }
}
