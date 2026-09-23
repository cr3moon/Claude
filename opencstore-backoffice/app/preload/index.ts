/**
 * Preload script – exposes safe IPC bridge to renderer.
 * Context isolation is ON; renderer never touches Node.js directly.
 *
 * Every method here has a matching ipcMain.handle(channel, ...)
 * in app/main/index.ts.
 */

import { contextBridge, ipcRenderer } from 'electron';

type IpcChannel = string;

const invoke = (channel: IpcChannel, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
  // ── App state ─────────────────────────────────────────────────────────────
  getState:              ()                              => invoke('app:getState'),
  getCurrentUser:        ()                              => invoke('app:getCurrentUser'),
  getOnboardingState:    ()                              => invoke('app:getOnboardingState'),

  // ── Auth ──────────────────────────────────────────────────────────────────
  login:                 (u: string, p: string)          => invoke('auth:login', { username: u, password: p }),
  logout:                ()                              => invoke('auth:logout'),

  // ── Onboarding ────────────────────────────────────────────────────────────
  completeOnboarding:    (payload: unknown)              => invoke('onboarding:complete', payload),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardMetrics:   ()                              => invoke('dashboard:getMetrics'),
  getDashboardSummary:   ()                              => invoke('dashboard:getMetrics'),  // alias
  getRecentAuditItems:   ()                              => invoke('dashboard:getRecentAuditItems'),

  // ── Store ─────────────────────────────────────────────────────────────────
  getStore:              ()                              => invoke('store:get'),
  updateStore:           (data: unknown)                 => invoke('store:update', data),
  storeListAccessible:   ()                              => invoke('store:listAccessible'),
  storeCreate:           (data: unknown)                 => invoke('store:create', data),
  storeSwitchActive:     (storeId: string)               => invoke('store:switchActive', storeId),
  storeGrantAccess:      (data: unknown)                 => invoke('store:grantAccess', data),
  storeRevokeAccess:     (data: unknown)                 => invoke('store:revokeAccess', data),
  storeListAllUsers:     ()                              => invoke('store:listAllUsers'),
  storeListAccessibleFor: (userId: string)                => invoke('store:listAccessibleFor', userId),
  storeGetMultiStoreSummary: ()                           => invoke('store:getMultiStoreSummary'),

  // ── Commander NAXML connection ───────────────────────────────────────────
  commanderTestConnection: (config: unknown)             => invoke('commander:testConnection', config),
  commanderGetConnectionSettings: ()                     => invoke('commander:getConnectionSettings'),
  commanderGetFuelPrices:  ()                             => invoke('commander:getFuelPrices'),
  commanderGetFuelTotals:  (period: 1 | 2 | 3 | 4)        => invoke('commander:getFuelTotals', period),
  commanderGetPumpMaintenanceTotals: ()                  => invoke('commander:getPumpMaintenanceTotals'),
  commanderGetVisibleGrades: ()                          => invoke('commander:getVisibleGrades'),
  commanderSetVisibleGrades: (grades: string[])          => invoke('commander:setVisibleGrades', grades),

  // ── Fuel sales snapshots ─────────────────────────────────────────────────
  fuelSnapshotCaptureToday:     ()                        => invoke('fuelSnapshot:captureToday'),
  fuelSnapshotGetVolumeTrend:   (data: unknown)           => invoke('fuelSnapshot:getVolumeTrend', data),
  fuelSnapshotGetRevenueTrend:  (data: unknown)           => invoke('fuelSnapshot:getRevenueTrend', data),
  fuelSnapshotGetPeriodTotals:  (data: unknown)           => invoke('fuelSnapshot:getPeriodTotals', data),

  // ── Manual daily sales entry ─────────────────────────────────────────────
  dailySalesUpsertEntry:        (data: unknown)           => invoke('dailySales:upsertEntry', data),
  dailySalesGetEntriesForDate:  (entryDate: string)        => invoke('dailySales:getEntriesForDate', entryDate),
  dailySalesGetDepartmentTotals: (data: unknown)          => invoke('dailySales:getDepartmentTotals', data),
  dailySalesGetDailyTotals:     (data: unknown)           => invoke('dailySales:getDailyTotals', data),
  dailySalesGetPeriodTotal:     (data: unknown)           => invoke('dailySales:getPeriodTotal', data),

  // ── Inventory ─────────────────────────────────────────────────────────────
  inventoryListVendors:       ()                          => invoke('inventory:listVendors'),
  inventoryCreateVendor:      (data: unknown)              => invoke('inventory:createVendor', data),
  inventoryCreateDelivery:    (data: unknown)              => invoke('inventory:createDelivery', data),
  inventoryAddDeliveryLine:   (data: unknown)              => invoke('inventory:addDeliveryLine', data),
  inventoryGetDelivery:       (deliveryId: string)         => invoke('inventory:getDelivery', deliveryId),
  inventoryListDeliveries:    ()                          => invoke('inventory:listDeliveries'),
  inventoryReceiveDelivery:   (deliveryId: string)         => invoke('inventory:receiveDelivery', deliveryId),
  inventoryCreateAdjustment:  (data: unknown)              => invoke('inventory:createAdjustment', data),
  inventoryGetOnHandLevels:   ()                          => invoke('inventory:getOnHandLevels'),
  inventoryGetValuation:      ()                          => invoke('inventory:getValuation'),

  // ── Lottery ───────────────────────────────────────────────────────────────
  lotteryListGames:        ()                             => invoke('lottery:listGames'),
  lotteryCreateGame:       (data: unknown)                => invoke('lottery:createGame', data),
  lotteryReceiveBook:      (data: unknown)                => invoke('lottery:receiveBook', data),
  lotteryActivateBook:     (bookId: string)               => invoke('lottery:activateBook', bookId),
  lotteryRecordCount:      (data: unknown)                => invoke('lottery:recordCount', data),
  lotteryReturnBook:       (bookId: string)               => invoke('lottery:returnBook', bookId),
  lotteryListBooks:        ()                             => invoke('lottery:listBooks'),

  // ── Time Clock ───────────────────────────────────────────────────────────
  timeClockGetMyStatus:    ()                             => invoke('timeClock:getMyStatus'),
  timeClockClockIn:        ()                             => invoke('timeClock:clockIn'),
  timeClockClockOut:       (breakMinutes: number)         => invoke('timeClock:clockOut', breakMinutes),
  timeClockListMyEntries:  ()                             => invoke('timeClock:listMyEntries'),
  timeClockListActiveUsers:()                             => invoke('timeClock:listActiveUsers'),
  timeClockListEntries:    ()                             => invoke('timeClock:listEntries'),
  timeClockEditEntry:      (data: unknown)                => invoke('timeClock:editEntry', data),

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings:           ()                              => invoke('settings:get'),
  saveSettings:          (data: unknown)                 => invoke('settings:save', data),

  // ── Import ────────────────────────────────────────────────────────────────
  runMockImport:         ()                              => invoke('import:runMockImport'),
  importFromFile:        (filePath: string, format: string) => invoke('import:fromFile', { filePath, format }),
  getImportHistory:      ()                              => invoke('import:getHistory'),
  openFileDialog:        ()                              => invoke('import:openFileDialog'),

  // ── Items ─────────────────────────────────────────────────────────────────
  getItems:              (opts: unknown)                 => invoke('items:getAll', opts),
  getDepartments:        ()                              => invoke('departments:getAll'),
  getCategories:         ()                              => invoke('categories:getAll'),

  // ── Item Audit ────────────────────────────────────────────────────────────
  runItemAudit:          ()                              => invoke('itemAudit:run'),
  getPendingItemRecs:    (jobRunId?: string)             => invoke('itemAudit:getPending', jobRunId),
  approveItemRec:        (recId: string, notes?: string) => invoke('itemAudit:approve', { recId, notes }),
  rejectItemRec:         (recId: string, notes?: string) => invoke('itemAudit:reject', { recId, notes }),

  // ── Pricing ───────────────────────────────────────────────────────────────
  runPricingAnalysis:    ()                              => invoke('pricing:runAnalysis'),
  getPendingPriceRecs:   (jobRunId?: string)             => invoke('pricing:getPending', jobRunId),
  approvePriceRec:       (recId: string, notes?: string) => invoke('pricing:approve', { recId, notes }),
  rejectPriceRec:        (recId: string, notes?: string) => invoke('pricing:reject', { recId, notes }),
  exportApprovedPrices:  ()                              => invoke('pricing:exportApproved'),

  // ── Reports ───────────────────────────────────────────────────────────────
  generateReport:        (params: unknown)               => invoke('reports:generate', params),
  getReportArchive:      ()                              => invoke('reports:getArchive'),
  getReportById:         (id: string)                    => invoke('reports:getById', id),

  // ── Shifts ────────────────────────────────────────────────────────────────
  getShifts:             ()                              => invoke('shifts:getAll'),
  openShift:             ()                              => invoke('shifts:open'),
  closeShift:            (shiftId: string)               => invoke('shifts:close', { shiftId }),

  // ── Checklists ────────────────────────────────────────────────────────────
  startChecklist:        (templateId: string)            => invoke('checklist:start', { templateId }),
  getChecklists:         ()                              => invoke('checklist:getHistory'),
  createChecklist:       (payload: unknown)              => invoke('checklist:create', payload),
  getChecklist:          (id: string)                    => invoke('checklist:getWithSteps', id),
  completeStep:          (payload: unknown)              => invoke('checklist:completeStep', payload),
  finalizeChecklist:     (payload: unknown)              => invoke('checklist:finalize', payload),
  getChecklistHistory:   ()                              => invoke('checklist:getHistory'),

  // ── Audit Log ─────────────────────────────────────────────────────────────
  getAuditLog:           (opts?: unknown)                => invoke('auditLog:getRecent', opts),

  // ── Shell helpers ─────────────────────────────────────────────────────────
  openPath:              (p: string)                     => invoke('shell:openPath', p),
  showInFolder:          (p: string)                     => invoke('shell:showItemInFolder', p),
});

// ── Global Window type ────────────────────────────────────────────────────────
// Gives window.electronAPI full TypeScript types in all /src/ renderer files.

declare global {
  interface Window {
    electronAPI: {
      getState:              () => Promise<{ onboardingComplete: boolean; activeUserId: string | null; activeStoreId: string | null; version: string }>;
      getCurrentUser:        () => Promise<unknown>;
      getOnboardingState:    () => Promise<{ completed: boolean }>;
      login:                 (u: string, p: string) => Promise<{ ok: boolean; user?: unknown; error?: string }>;
      logout:                () => Promise<void>;
      completeOnboarding:    (payload: unknown) => Promise<{ success: boolean; storeId: string; userId: string }>;
      getDashboardMetrics:   () => Promise<unknown>;
      getDashboardSummary:   () => Promise<unknown>;
      getRecentAuditItems:   () => Promise<unknown[]>;
      getStore:              () => Promise<{
        id: string; name: string; address: string | null; city: string | null; state: string | null;
        zip: string | null; phone: string | null; timezone: string; tax_rate: number;
        fuel_tax_rate: number; currency: string; pos_type: string | null;
      } | undefined>;
      updateStore:           (data: unknown) => Promise<{ success: boolean }>;
      storeListAccessible:   () => Promise<unknown[]>;
      storeCreate:           (data: unknown) => Promise<{ success: boolean; storeId: string } | { error: string }>;
      storeSwitchActive:     (storeId: string) => Promise<{ success: boolean; store: unknown } | { error: string }>;
      storeGrantAccess:      (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      storeRevokeAccess:     (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      storeListAllUsers:     () => Promise<unknown[]>;
      storeListAccessibleFor: (userId: string) => Promise<unknown[]>;
      storeGetMultiStoreSummary: () => Promise<unknown[]>;
      commanderTestConnection: (config: unknown) => Promise<{ success: boolean; latencyMs?: number; message: string }>;
      commanderGetConnectionSettings: () => Promise<{
        host: string; port: number; username_hint: string; connection_status: string; last_tested_at: string | null;
      } | null>;
      commanderGetFuelPrices: () => Promise<{ error: string } | Array<{
        sysid: number; name: string; naxmlFuelGradeId: number | null;
        inEffectCash: number | null; inEffectCredit: number | null;
        pendingCash: number | null; pendingCredit: number | null;
      }>>;
      commanderGetFuelTotals: (period: 1 | 2 | 3 | 4) => Promise<{ error: string } | Array<{
        grade: string; volumeGallons: number; revenueUsd: number; avgPrice: number | null;
      }>>;
      commanderGetPumpMaintenanceTotals: () => Promise<{ error: string } | Array<{
        pumpSysid: number; hoseSysid: number; grade: string;
        totalMoneyUsd: number; totalVolumeGallons: number; totalTransactions: number;
      }>>;
      commanderGetVisibleGrades: () => Promise<string[] | null>;
      commanderSetVisibleGrades: (grades: string[]) => Promise<{ success: boolean } | { error: string }>;
      fuelSnapshotCaptureToday:     () => Promise<{ success: boolean } | { error: string }>;
      fuelSnapshotGetVolumeTrend:   (data: unknown) => Promise<Array<{ grade: string; points: Array<{ date: string; value: number }> }>>;
      fuelSnapshotGetRevenueTrend:  (data: unknown) => Promise<Array<{ date: string; value: number }>>;
      fuelSnapshotGetPeriodTotals:  (data: unknown) => Promise<{ gallons: number; revenue: number }>;
      dailySalesUpsertEntry:        (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      dailySalesGetEntriesForDate:  (entryDate: string) => Promise<unknown[]>;
      dailySalesGetDepartmentTotals: (data: unknown) => Promise<Array<{ category: string; value: number }>>;
      dailySalesGetDailyTotals:     (data: unknown) => Promise<Array<{ date: string; value: number }>>;
      dailySalesGetPeriodTotal:     (data: unknown) => Promise<number>;
      inventoryListVendors:       () => Promise<unknown[]>;
      inventoryCreateVendor:      (data: unknown) => Promise<{ success: boolean; id: string } | { error: string }>;
      inventoryCreateDelivery:    (data: unknown) => Promise<{ success: boolean; id: string } | { error: string }>;
      inventoryAddDeliveryLine:   (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      inventoryGetDelivery:       (deliveryId: string) => Promise<{ delivery: unknown; lines: unknown[] } | null>;
      inventoryListDeliveries:    () => Promise<unknown[]>;
      inventoryReceiveDelivery:   (deliveryId: string) => Promise<{ success: boolean } | { error: string }>;
      inventoryCreateAdjustment:  (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      inventoryGetOnHandLevels:   () => Promise<unknown[]>;
      inventoryGetValuation:      () => Promise<{ totalValue: number; itemCount: number; lowStockCount: number }>;
      lotteryListGames:        () => Promise<unknown[]>;
      lotteryCreateGame:       (data: unknown) => Promise<{ success: boolean; id: string } | { error: string }>;
      lotteryReceiveBook:      (data: unknown) => Promise<{ success: boolean; id: string } | { error: string }>;
      lotteryActivateBook:     (bookId: string) => Promise<{ success: boolean } | { error: string }>;
      lotteryRecordCount:      (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      lotteryReturnBook:       (bookId: string) => Promise<{ success: boolean } | { error: string }>;
      lotteryListBooks:        () => Promise<unknown[]>;
      timeClockGetMyStatus:    () => Promise<unknown | null>;
      timeClockClockIn:        () => Promise<{ success: boolean } | { error: string }>;
      timeClockClockOut:       (breakMinutes: number) => Promise<{ success: boolean } | { error: string }>;
      timeClockListMyEntries:  () => Promise<unknown[]>;
      timeClockListActiveUsers:() => Promise<unknown[]>;
      timeClockListEntries:    () => Promise<unknown[]>;
      timeClockEditEntry:      (data: unknown) => Promise<{ success: boolean } | { error: string }>;
      getSettings:           () => Promise<Record<string, string>>;
      saveSettings:          (data: unknown) => Promise<void>;
      runMockImport:         () => Promise<unknown>;
      importFromFile:        (filePath: string, format: string) => Promise<unknown>;
      getImportHistory:      () => Promise<unknown[]>;
      openFileDialog:        () => Promise<{ canceled: boolean; filePaths: string[] }>;
      getItems:              (opts: unknown) => Promise<{ items: Array<{ id: string; pos_plu_id: string; description: string }>; total: number }>;
      getDepartments:        () => Promise<unknown[]>;
      getCategories:         () => Promise<unknown[]>;
      runItemAudit:          () => Promise<unknown>;
      getPendingItemRecs:    (jobRunId?: string) => Promise<unknown[]>;
      approveItemRec:        (recId: string, notes?: string) => Promise<void>;
      rejectItemRec:         (recId: string, notes?: string) => Promise<void>;
      runPricingAnalysis:    () => Promise<unknown>;
      getPendingPriceRecs:   (jobRunId?: string) => Promise<unknown[]>;
      approvePriceRec:       (recId: string, notes?: string) => Promise<void>;
      rejectPriceRec:        (recId: string, notes?: string) => Promise<void>;
      exportApprovedPrices:  () => Promise<unknown>;
      generateReport:        (params: unknown) => Promise<{ id: string; data: unknown }>;
      getReportArchive:      () => Promise<unknown[]>;
      getReportById:         (id: string) => Promise<unknown>;
      getShifts:             () => Promise<unknown[]>;
      openShift:             () => Promise<{ id: string; status: string; opened_at: string }>;
      closeShift:            (shiftId: string) => Promise<void>;
      startChecklist:        (templateId: string) => Promise<{ id: string; templateId: string; steps: { key: string; label: string }[] }>;
      getChecklists:         () => Promise<unknown[]>;
      createChecklist:       (payload: unknown) => Promise<unknown>;
      getChecklist:          (id: string) => Promise<unknown>;
      completeStep:          (payload: unknown) => Promise<void>;
      finalizeChecklist:     (payload: unknown) => Promise<void>;
      getChecklistHistory:   () => Promise<unknown[]>;
      getAuditLog:           (opts?: unknown) => Promise<unknown[]>;
      openPath:              (p: string) => Promise<void>;
      showInFolder:          (p: string) => Promise<void>;
    };
  }
}
