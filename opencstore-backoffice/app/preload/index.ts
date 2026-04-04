/**
 * Preload script – exposes safe IPC bridge to renderer.
 * Context isolation is ON; renderer never touches Node.js directly.
 */

import { contextBridge, ipcRenderer } from 'electron';

type IpcChannel = string;

const invoke = (channel: IpcChannel, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('electronAPI', {
  // App
  getState:          ()           => invoke('app:getState'),

  // Auth
  login:             (u: string, p: string) => invoke('auth:login', { username: u, password: p }),
  logout:            ()           => invoke('auth:logout'),

  // Onboarding
  completeOnboarding: (payload: unknown) => invoke('onboarding:complete', payload),

  // Dashboard
  getDashboardSummary: ()         => invoke('dashboard:getSummary'),

  // Store
  getStore:          ()           => invoke('store:get'),

  // Import
  runMockImport:     ()           => invoke('import:runMockImport'),
  importFromFile:    (filePath: string, format: string) => invoke('import:fromFile', { filePath, format }),
  getImportHistory:  ()           => invoke('import:getHistory'),
  openFileDialog:    ()           => invoke('import:openFileDialog'),

  // Items
  getItems:          (opts: unknown) => invoke('items:getAll', opts),

  // Departments / Categories
  getDepartments:    ()           => invoke('departments:getAll'),
  getCategories:     ()           => invoke('categories:getAll'),

  // Item Audit
  runItemAudit:      ()           => invoke('itemAudit:run'),
  getPendingItemRecs: (jobRunId?: string) => invoke('itemAudit:getPending', jobRunId),
  approveItemRec:    (recId: string, notes?: string) => invoke('itemAudit:approve', { recId, notes }),
  rejectItemRec:     (recId: string, notes?: string) => invoke('itemAudit:reject', { recId, notes }),

  // Pricing
  runPricingAnalysis: ()          => invoke('pricing:runAnalysis'),
  getPendingPriceRecs: (jobRunId?: string) => invoke('pricing:getPending', jobRunId),
  approvePriceRec:   (recId: string, notes?: string) => invoke('pricing:approve', { recId, notes }),
  rejectPriceRec:    (recId: string, notes?: string) => invoke('pricing:reject', { recId, notes }),
  exportApprovedPrices: ()        => invoke('pricing:exportApproved'),

  // Reports
  generateReport:    (params: unknown) => invoke('reports:generate', params),
  getReportArchive:  ()           => invoke('reports:getArchive'),
  getReportById:     (id: string) => invoke('reports:getById', id),

  // Checklists
  createChecklist:   (payload: unknown) => invoke('checklist:create', payload),
  getChecklist:      (id: string)       => invoke('checklist:getWithSteps', id),
  completeStep:      (payload: unknown) => invoke('checklist:completeStep', payload),
  finalizeChecklist: (payload: unknown) => invoke('checklist:finalize', payload),
  getChecklistHistory: ()               => invoke('checklist:getHistory'),

  // Audit Log
  getAuditLog:       (opts?: unknown)   => invoke('auditLog:getRecent', opts),

  // Shell
  openPath:          (p: string)        => invoke('shell:openPath', p),
  showInFolder:      (p: string)        => invoke('shell:showItemInFolder', p),
});

// Type declaration for renderer
export type ElectronAPI = typeof import('./index')['electronAPI'];
