/**
 * src/modules/integrations/commander-naxml.service.ts
 *
 * Renderer-side facade for the real Verifone Commander NAXML connection.
 * All actual HTTP/session handling happens in the main process
 * (integrations/commander/CommanderNaxmlClient.ts) — the renderer never
 * touches the Commander unit or its credentials directly, same as every
 * other privileged operation in this app.
 *
 * This is a separate concern from the PLU/pricebook import adapters: the
 * Commander's NAXML API covers fuel pricing and fuel totals, not the
 * inside-store item catalog.
 */

export interface CommanderConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
}

export interface CommanderTestResult {
  success: boolean;
  latencyMs?: number;
  message: string;
}

export interface CommanderConnectionSettings {
  host: string;
  port: number;
  username_hint: string;
  connection_status: string;
  last_tested_at: string | null;
}

export interface FuelGradePrice {
  sysid: number;
  name: string;
  naxmlFuelGradeId: number | null;
  inEffectCash: number | null;
  inEffectCredit: number | null;
  pendingCash: number | null;
  pendingCredit: number | null;
}

export interface FuelGradeTotal {
  grade: string;
  volumeGallons: number;
  revenueUsd: number;
  avgPrice: number | null;
}

export interface PumpHoseTotal {
  pumpSysid: number;
  hoseSysid: number;
  grade: string;
  totalMoneyUsd: number;
  totalVolumeGallons: number;
  totalTransactions: number;
}

export type FuelTotalsPeriod = 1 | 2 | 3 | 4;

function unwrap<T>(result: T | { error: string }): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const CommanderNaxmlService = {
  async testConnection(config: CommanderConnectionConfig): Promise<CommanderTestResult> {
    return window.electronAPI.commanderTestConnection(config);
  },

  async getConnectionSettings(): Promise<CommanderConnectionSettings | null> {
    return window.electronAPI.commanderGetConnectionSettings();
  },

  async getFuelPrices(): Promise<FuelGradePrice[]> {
    return unwrap(await window.electronAPI.commanderGetFuelPrices());
  },

  async getFuelTotals(period: FuelTotalsPeriod): Promise<FuelGradeTotal[]> {
    return unwrap(await window.electronAPI.commanderGetFuelTotals(period));
  },

  async getPumpMaintenanceTotals(): Promise<PumpHoseTotal[]> {
    return unwrap(await window.electronAPI.commanderGetPumpMaintenanceTotals());
  },

  /** Per-site allow-list of which grades to display. null/[] = no filter, show all. */
  async getVisibleGrades(): Promise<string[] | null> {
    return window.electronAPI.commanderGetVisibleGrades();
  },

  async setVisibleGrades(grades: string[]): Promise<void> {
    unwrap(await window.electronAPI.commanderSetVisibleGrades(grades));
  },
};
