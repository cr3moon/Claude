/**
 * src/lib/db.ts
 *
 * Lightweight database access wrapper.
 * In the Electron main process, DatabaseService (backend/services/DatabaseService.ts)
 * holds the actual better-sqlite3 instance.  This module provides the renderer-side
 * contract (type re-exports and the IPC call helpers) so that page / service code
 * never touches Node.js directly.
 *
 * In non-Electron contexts (tests, Node scripts) it can import DatabaseService
 * directly via the alias defined in tsconfig.electron.json.
 */

// ─── Re-export shared DB types ─────────────────────────────────────────────

export type DbId = string; // UUID v4

export interface Timestamped {
  created_at: string; // ISO-8601 UTC
  updated_at: string;
}

export interface SoftDelete extends Timestamped {
  deleted_at: string | null;
}

// ─── Generic paginated result ──────────────────────────────────────────────

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ─── IPC helper used by renderer-side services ─────────────────────────────

/**
 * Thin type-safe wrapper around window.electronAPI IPC calls.
 * Import this in renderer services so they don't reference window directly.
 */
export function ipc<T>(channel: string, ...args: unknown[]): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electronAPI[channel]?.(...args) as Promise<T>;
}
