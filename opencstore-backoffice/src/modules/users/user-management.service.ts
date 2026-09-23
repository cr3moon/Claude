/**
 * src/modules/users/user-management.service.ts
 *
 * Renderer-side facade for the user-management and recovery IPC handlers.
 * Mirrors the other *.service.ts facades in this app.
 */

export interface ManagedUser {
  id: string;
  username: string;
  display_name: string;
  role: 'owner' | 'manager' | 'cashier';
  is_active: boolean;
  created_at: string;
}

export interface NewUserInput {
  username: string;
  password: string;
  display_name: string;
  role: 'owner' | 'manager' | 'cashier';
}

export interface RecoveryUsername {
  id: string;
  username: string;
  display_name: string;
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const UserManagementService = {
  async listUsers(): Promise<ManagedUser[]> {
    return window.electronAPI.usersList() as Promise<ManagedUser[]>;
  },

  async createUser(input: NewUserInput): Promise<string> {
    const result = await window.electronAPI.usersCreate(input);
    return unwrap(result as Result<{ success: true; userId: string }>).userId;
  },

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    unwrap(await window.electronAPI.usersResetPassword({ userId, newPassword }));
  },

  async setActive(userId: string, active: boolean): Promise<void> {
    unwrap(await window.electronAPI.usersSetActive({ userId, active }));
  },

  /** Called before login exists — never throws, returns [] on no match. */
  async getRecoveryUsernames(storeName: string): Promise<RecoveryUsername[]> {
    return window.electronAPI.authGetRecoveryUsernames(storeName) as Promise<RecoveryUsername[]>;
  },

  async recoverPassword(storeName: string, username: string, newPassword: string): Promise<void> {
    unwrap(await window.electronAPI.authRecoverPassword({ storeName, username, newPassword }));
  },
};
