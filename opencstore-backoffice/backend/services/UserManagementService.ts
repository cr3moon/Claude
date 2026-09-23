/**
 * UserManagementService
 *
 * Owner-facing account management (create, reset password, deactivate) for
 * the currently authenticated store, plus a store-name-gated emergency
 * recovery path for when nobody can log in at all.
 *
 * Threat model for the recovery path: this is a local, single-tenant
 * desktop app. On Windows, everything lives under the OS user's own
 * %APPDATA%, so anyone who can already reach this app's login screen has
 * the same filesystem access as that Windows user — a written-to-disk
 * recovery secret wouldn't raise the bar here. Gating recovery on the
 * store name (set during onboarding, known to whoever runs the store)
 * plus an existing active username is enough to stop a stranger from
 * resetting a password blind, while still working for an install that
 * never had a recovery key generated for it.
 */

import * as bcrypt from 'bcryptjs';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { wouldRemoveLastActiveOwner } from '../../src/modules/users/user-management-rules';

export type UserRole = 'owner' | 'manager' | 'cashier';

export interface ManagedUser {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface NewUserInput {
  username: string;
  password: string;
  display_name: string;
  role: UserRole;
}

export interface RecoveryUsername {
  id: string;
  username: string;
  display_name: string;
}

const MIN_PASSWORD_LENGTH = 8;

export class UserManagementService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  // ─── Owner-facing management (requires an authenticated session) ─────────

  listUsers(storeId: string): ManagedUser[] {
    return this.db
      .all<{ id: string; username: string; display_name: string; role: UserRole; is_active: number; created_at: string }>(
        'SELECT id, username, display_name, role, is_active, created_at FROM users WHERE store_id=? ORDER BY display_name',
        [storeId]
      )
      .map(u => ({ ...u, is_active: Boolean(u.is_active) }));
  }

  async createUser(storeId: string, actingUserId: string, input: NewUserInput): Promise<string> {
    const username = input.username.trim();
    const displayName = input.display_name.trim();
    if (!username) throw new Error('Username is required.');
    if (!displayName) throw new Error('Display name is required.');
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const existing = this.db.get<{ id: string }>('SELECT id FROM users WHERE username=?', [username]);
    if (existing) throw new Error(`Username "${username}" is already taken.`);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = this.db.createUser({
      store_id: storeId,
      username,
      password_hash: passwordHash,
      display_name: displayName,
      role: input.role,
    });

    this.audit.log({
      storeId, userId: actingUserId, eventType: 'user', eventSubtype: 'user_created',
      description: `Created ${input.role} account "${username}" (${displayName}).`,
      entityType: 'user', entityId: userId,
    });

    return userId;
  }

  async resetPassword(targetUserId: string, storeId: string, newPassword: string, actingUserId: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const target = this.db.get<{ id: string; store_id: string; username: string }>(
      'SELECT id, store_id, username FROM users WHERE id=?', [targetUserId]
    );
    if (!target || target.store_id !== storeId) throw new Error('User not found.');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date().toISOString();
    this.db.run('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [passwordHash, now, targetUserId]);

    this.audit.log({
      storeId, userId: actingUserId, eventType: 'user', eventSubtype: 'password_reset',
      description: `Reset password for user "${target.username}".`,
      entityType: 'user', entityId: targetUserId,
    });
  }

  setActive(targetUserId: string, storeId: string, active: boolean, actingUserId: string): void {
    const target = this.db.get<{ id: string; store_id: string; username: string; role: UserRole; is_active: number }>(
      'SELECT id, store_id, username, role, is_active FROM users WHERE id=?', [targetUserId]
    );
    if (!target || target.store_id !== storeId) throw new Error('User not found.');

    if (!active) {
      const owners = this.db
        .all<{ id: string; is_active: number }>(
          "SELECT id, is_active FROM users WHERE store_id=? AND role='owner'", [storeId]
        )
        .map(o => ({ id: o.id, isActive: Boolean(o.is_active) }));
      if (wouldRemoveLastActiveOwner(owners, targetUserId)) {
        throw new Error("Can't deactivate the only active owner account.");
      }
    }

    const now = new Date().toISOString();
    this.db.run('UPDATE users SET is_active=?, updated_at=? WHERE id=?', [active ? 1 : 0, now, targetUserId]);

    this.audit.log({
      storeId, userId: actingUserId,
      eventType: 'user', eventSubtype: active ? 'user_reactivated' : 'user_deactivated',
      description: `${active ? 'Reactivated' : 'Deactivated'} user "${target.username}".`,
      entityType: 'user', entityId: targetUserId,
    });
  }

  // ─── Emergency recovery (no active session required) ─────────────────────

  /**
   * Active usernames for the store matching `storeName` (case-insensitive,
   * trimmed). Never throws and returns [] on no match, since this is called
   * before any authentication exists — an error here would leak which
   * store names are valid.
   */
  getRecoveryUsernames(storeName: string): RecoveryUsername[] {
    const store = this.findStoreByName(storeName);
    if (!store) return [];
    return this.db.all<RecoveryUsername>(
      'SELECT id, username, display_name FROM users WHERE store_id=? AND is_active=1 ORDER BY display_name',
      [store.id]
    );
  }

  async recoverPassword(storeName: string, username: string, newPassword: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const genericError = 'Store name and username did not match an active account.';

    const store = this.findStoreByName(storeName);
    if (!store) throw new Error(genericError);

    const target = this.db.get<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE store_id=? AND username=? AND is_active=1',
      [store.id, username.trim()]
    );
    if (!target) throw new Error(genericError);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date().toISOString();
    this.db.run('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [passwordHash, now, target.id]);

    this.audit.log({
      storeId: store.id, userId: target.id,
      eventType: 'auth', eventSubtype: 'password_reset_via_recovery',
      description: `Password reset via store-name recovery for user "${target.username}".`,
      entityType: 'user', entityId: target.id,
    });
  }

  private findStoreByName(storeName: string): { id: string } | undefined {
    const name = storeName?.trim();
    if (!name) return undefined;
    return this.db.get<{ id: string }>(
      'SELECT id FROM stores WHERE LOWER(TRIM(name)) = LOWER(?)', [name]
    );
  }
}
