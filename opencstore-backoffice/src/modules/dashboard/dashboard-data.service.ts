/**
 * src/modules/dashboard/dashboard-data.service.ts
 *
 * Renderer-side facade for the manual daily sales entry and fuel snapshot
 * IPC handlers that feed the dashboard's charts. Mirrors the other
 * *.service.ts facades.
 */

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CategoryValue {
  category: string;
  value: number;
}

export interface DayValue {
  date: string;
  value: number;
}

export interface FuelTrendSeries {
  grade: string;
  points: DayValue[];
}

export interface ManualSalesEntry {
  id: string;
  entry_date: string;
  department_id: string;
  department_name: string;
  amount: number;
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const DashboardDataService = {
  async captureFuelSnapshotToday(): Promise<void> {
    unwrap(await window.electronAPI.fuelSnapshotCaptureToday());
  },

  async getFuelVolumeTrend(range: DateRange): Promise<FuelTrendSeries[]> {
    return window.electronAPI.fuelSnapshotGetVolumeTrend(range);
  },

  async getFuelRevenueTrend(range: DateRange): Promise<DayValue[]> {
    return window.electronAPI.fuelSnapshotGetRevenueTrend(range);
  },

  async getFuelPeriodTotals(range: DateRange): Promise<{ gallons: number; revenue: number }> {
    return window.electronAPI.fuelSnapshotGetPeriodTotals(range);
  },

  async upsertDailySalesEntry(entryDate: string, departmentId: string, amount: number): Promise<void> {
    unwrap(await window.electronAPI.dailySalesUpsertEntry({ entryDate, departmentId, amount }));
  },

  async getEntriesForDate(entryDate: string): Promise<ManualSalesEntry[]> {
    return window.electronAPI.dailySalesGetEntriesForDate(entryDate) as Promise<ManualSalesEntry[]>;
  },

  async getDepartmentTotals(range: DateRange): Promise<CategoryValue[]> {
    return window.electronAPI.dailySalesGetDepartmentTotals(range);
  },

  async getDailyTotals(range: DateRange): Promise<DayValue[]> {
    return window.electronAPI.dailySalesGetDailyTotals(range);
  },

  async getSalesPeriodTotal(range: DateRange): Promise<number> {
    return window.electronAPI.dailySalesGetPeriodTotal(range);
  },
};
