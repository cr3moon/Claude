/**
 * src/modules/reconciliation/reconciliation.service.ts
 *
 * Renderer-side facade for the Commander report reconciliation IPC
 * handlers. Mirrors the other *.service.ts facades in this app.
 */

export interface CommanderSnapshot {
  id: string;
  period_type: 1 | 2;
  report_date: string;
  period_filename: string;
  period_value: string;
  fuel_sales: number;
  outside_sales_delta: number | null;
  high_tax_taxable: number;
  high_tax_net: number;
  low_tax_taxable: number;
  low_tax_net: number;
  cash_tender: number;
  credit_tender: number;
  debit_tender: number;
  created_at: string;
  updated_at: string;
}

export interface VarianceRow {
  label: string;
  manual: number;
  commander: number;
  variance: number;
}

export interface DailyReconciliation {
  hasCommanderData: boolean;
  dailySnapshot: CommanderSnapshot | null;
  departmentVariance: VarianceRow[];
  shiftSnapshots: CommanderSnapshot[];
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const ReconciliationService = {
  async captureDailyReport(dateIso: string): Promise<CommanderSnapshot> {
    const result = await window.electronAPI.reconciliationCaptureDailyReport(dateIso);
    return unwrap(result as Result<{ success: true; snapshot: CommanderSnapshot }>).snapshot;
  },

  async captureShiftReports(dateIso: string): Promise<CommanderSnapshot[]> {
    const result = await window.electronAPI.reconciliationCaptureShiftReports(dateIso);
    return unwrap(result as Result<{ success: true; snapshots: CommanderSnapshot[] }>).snapshots;
  },

  async getDailyReconciliation(dateIso: string): Promise<DailyReconciliation> {
    return window.electronAPI.reconciliationGetDailyReconciliation(dateIso) as unknown as Promise<DailyReconciliation>;
  },
};
