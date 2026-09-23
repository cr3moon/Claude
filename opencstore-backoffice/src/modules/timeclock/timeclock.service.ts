/**
 * src/modules/timeclock/timeclock.service.ts
 *
 * Renderer-side facade for the Time Clock IPC handlers. Mirrors
 * inventory.service.ts / lottery.service.ts.
 */

export interface TimeClockEntry {
  id: string;
  store_id: string;
  user_id: string;
  display_name?: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  edited_by: string | null;
  edited_at: string | null;
  edit_reason: string | null;
}

export interface ActiveUserStatus {
  id: string;
  display_name: string;
  role: string;
  hourly_wage: number | null;
  open_entry_id: string | null;
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const TimeClockService = {
  async getMyStatus(): Promise<TimeClockEntry | null> {
    return window.electronAPI.timeClockGetMyStatus() as Promise<TimeClockEntry | null>;
  },

  async clockIn(): Promise<void> {
    unwrap(await window.electronAPI.timeClockClockIn());
  },

  async clockOut(breakMinutes: number): Promise<void> {
    unwrap(await window.electronAPI.timeClockClockOut(breakMinutes));
  },

  async listMyEntries(): Promise<TimeClockEntry[]> {
    return window.electronAPI.timeClockListMyEntries() as Promise<TimeClockEntry[]>;
  },

  async listActiveUsers(): Promise<ActiveUserStatus[]> {
    return window.electronAPI.timeClockListActiveUsers() as Promise<ActiveUserStatus[]>;
  },

  async listEntries(): Promise<TimeClockEntry[]> {
    return window.electronAPI.timeClockListEntries() as Promise<TimeClockEntry[]>;
  },

  async editEntry(entryId: string, clockIn: string, clockOut: string, breakMinutes: number, reason: string): Promise<void> {
    unwrap(await window.electronAPI.timeClockEditEntry({ entryId, clockIn, clockOut, breakMinutes, reason }));
  },
};
