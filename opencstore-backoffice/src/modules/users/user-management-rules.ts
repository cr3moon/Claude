/**
 * src/modules/users/user-management-rules.ts
 *
 * Pure logic for account management, kept separate from
 * UserManagementService so the "don't lock yourself out" invariant is
 * testable without a database.
 */

export interface OwnerActiveState {
  id: string;
  isActive: boolean;
}

/**
 * True when deactivating `targetId` would leave the store with zero active
 * owner accounts — the one lockout this app can prevent outright, since an
 * install with no active owner has no one left who can create or reset any
 * other account.
 */
export function wouldRemoveLastActiveOwner(owners: OwnerActiveState[], targetId: string): boolean {
  const target = owners.find(o => o.id === targetId);
  if (!target || !target.isActive) return false;
  return !owners.some(o => o.id !== targetId && o.isActive);
}
