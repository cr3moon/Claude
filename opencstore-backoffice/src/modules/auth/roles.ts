/**
 * src/modules/auth/roles.ts
 *
 * Local role definitions and permission helpers.
 * There is no server-side auth – roles are stored per user in SQLite.
 */

// ─── Role definitions ────────────────────────────────────────────────────────

export type Role = 'owner' | 'manager' | 'cashier';

export const ROLES: Record<Role, { label: string; description: string }> = {
  owner: {
    label:       'Owner / Admin',
    description: 'Full access. Can approve changes, configure settings, and apply write-back exports.',
  },
  manager: {
    label:       'Manager',
    description: 'Can view reports, run checklists, and review recommendations. Cannot apply changes.',
  },
  cashier: {
    label:       'Shift Lead / Cashier',
    description: 'Can complete operations checklists only.',
  },
};

// ─── Permissions ─────────────────────────────────────────────────────────────

export type Permission =
  | 'view_dashboard'
  | 'view_reports'
  | 'generate_reports'
  | 'view_item_audit'
  | 'run_item_audit'
  | 'approve_item_changes'
  | 'view_pricing'
  | 'run_pricing_analysis'
  | 'approve_price_changes'
  | 'export_changes'
  | 'view_imports'
  | 'run_import'
  | 'view_inventory'
  | 'manage_inventory'
  | 'view_lottery'
  | 'manage_lottery'
  | 'use_time_clock'
  | 'manage_time_clock'
  | 'view_operations'
  | 'run_checklists'
  | 'view_audit_log'
  | 'view_settings'
  | 'edit_settings'
  | 'manage_users'
  | 'configure_connection';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'view_dashboard',
    'view_reports', 'generate_reports',
    'view_item_audit', 'run_item_audit', 'approve_item_changes',
    'view_pricing', 'run_pricing_analysis', 'approve_price_changes', 'export_changes',
    'view_imports', 'run_import',
    'view_inventory', 'manage_inventory',
    'view_lottery', 'manage_lottery',
    'use_time_clock', 'manage_time_clock',
    'view_operations', 'run_checklists',
    'view_audit_log',
    'view_settings', 'edit_settings', 'manage_users', 'configure_connection',
  ],
  manager: [
    'view_dashboard',
    'view_reports', 'generate_reports',
    'view_item_audit',
    'view_pricing',
    'view_imports',
    'view_inventory', 'manage_inventory',
    'view_lottery', 'manage_lottery',
    'use_time_clock', 'manage_time_clock',
    'view_operations', 'run_checklists',
    'view_audit_log',
    'view_settings',
  ],
  cashier: [
    'view_dashboard',
    'use_time_clock',
    'view_operations', 'run_checklists',
  ],
};

/** Returns true when the given role has the given permission */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Returns all permissions for a role */
export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
