/**
 * Electron Main Process – OpenCStore Back Office
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { DatabaseService } from '../../backend/services/DatabaseService';
import { ImportService } from '../../backend/services/ImportService';
import { ItemAuditService } from '../../backend/services/ItemAuditService';
import { PricingService } from '../../backend/services/PricingService';
import { ReportService } from '../../backend/services/ReportService';
import { AuditLogger } from '../../audit/AuditLogger';
import { MockVerifoneAdapter } from '../../integrations/adapters/MockVerifoneAdapter';

// ─── Paths ────────────────────────────────────────────────────────────────────

const USER_DATA = app.getPath('userData');
const DB_PATH   = path.join(USER_DATA, 'opencstore.db');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const EXPORT_DIR = path.join(USER_DATA, 'exports');

// ─── Services (singleton per process) ────────────────────────────────────────

const dbService   = new DatabaseService(DB_PATH);
const auditLogger = new AuditLogger(dbService);
const importSvc   = new ImportService(dbService, auditLogger);
const itemAuditSvc = new ItemAuditService(dbService, auditLogger);
const pricingSvc  = new PricingService(dbService, auditLogger);
const reportSvc   = new ReportService(dbService, auditLogger);

// Active session state (lightweight, no persistence needed for MVP)
let activeUserId: string | null = null;
let activeStoreId: string | null = null;

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'OpenCStore Back Office',
  });

  if (process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL']);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  dbService.open();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    dbService.close();
    app.quit();
  }
});

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// ── App state ────────────────────────────────────────────────────────────────

ipcMain.handle('app:getState', () => ({
  onboardingComplete: dbService.isOnboardingComplete(),
  activeUserId,
  activeStoreId,
  version: app.getVersion(),
}));

// ── Auth ─────────────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_e, { username, password }: { username: string; password: string }) => {
  const user = dbService.getUserByUsername(username) as {
    id: string; password_hash: string; display_name: string; role: string; store_id: string;
  } | undefined;

  if (!user) {
    auditLogger.log({ eventType: 'auth', eventSubtype: 'login_failed',
      description: `Login failed: unknown user "${username}"`, result: 'failure' });
    return { success: false, error: 'Invalid username or password.' };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    auditLogger.log({ storeId: user.store_id, eventType: 'auth', eventSubtype: 'login_failed',
      description: `Login failed for user ${username}`, result: 'failure' });
    return { success: false, error: 'Invalid username or password.' };
  }

  activeUserId  = user.id;
  activeStoreId = user.store_id;

  auditLogger.log({ storeId: user.store_id, userId: user.id, eventType: 'auth', eventSubtype: 'login',
    description: `User "${user.display_name}" logged in.` });

  return { success: true, user: { id: user.id, display_name: user.display_name, role: user.role, store_id: user.store_id } };
});

ipcMain.handle('auth:logout', () => {
  if (activeUserId) {
    auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId,
      eventType: 'auth', eventSubtype: 'logout', description: 'User logged out.' });
  }
  activeUserId  = null;
  activeStoreId = null;
  return { success: true };
});

// ── Onboarding ───────────────────────────────────────────────────────────────

ipcMain.handle('onboarding:complete', async (_e, payload: {
  store: { name: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; timezone: string; tax_rate: number; fuel_tax_rate: number; pos_type?: string };
  admin: { username: string; password: string; display_name: string };
}) => {
  const { store, admin } = payload;

  const storeId = dbService.upsertStore(store);
  const passwordHash = await bcrypt.hash(admin.password, 12);
  const userId = dbService.createUser({
    store_id: storeId,
    username: admin.username,
    password_hash: passwordHash,
    display_name: admin.display_name,
    role: 'owner',
  });

  dbService.setSetting('onboarding_complete', 'true', 'Onboarding wizard completed');

  auditLogger.log({ storeId, userId, eventType: 'onboarding', eventSubtype: 'complete',
    description: `Onboarding completed. Store "${store.name}" created. Admin user "${admin.username}" created.` });

  activeUserId  = userId;
  activeStoreId = storeId;

  return { success: true, storeId, userId };
});

// ── Dashboard ────────────────────────────────────────────────────────────────

ipcMain.handle('dashboard:getSummary', () => {
  if (!activeStoreId) return { error: 'Not authenticated' };
  return dbService.getDashboardSummary(activeStoreId);
});

// ── Store ────────────────────────────────────────────────────────────────────

ipcMain.handle('store:get', () => dbService.getStore());

// ── Import ───────────────────────────────────────────────────────────────────

ipcMain.handle('import:runMockImport', async () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };

  const adapter = new MockVerifoneAdapter();
  adapter.configure({ adapterType: 'mock', readOnly: true });

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  return importSvc.runImport({
    storeId: activeStoreId,
    userId: activeUserId,
    adapter,
    format: 'xml_plu',
    backupDir: BACKUP_DIR,
  });
});

ipcMain.handle('import:fromFile', async (_e, { filePath, format }: { filePath: string; format: string }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };

  const adapter = new MockVerifoneAdapter();
  adapter.configure({ adapterType: 'file_import', readOnly: true });

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  return importSvc.runImport({
    storeId: activeStoreId,
    userId: activeUserId,
    adapter,
    sourceFile: filePath,
    format: format as 'xml_plu' | 'csv_pricebook',
    backupDir: BACKUP_DIR,
  });
});

ipcMain.handle('import:getHistory', () => {
  if (!activeStoreId) return [];
  return importSvc.getImportHistory(activeStoreId);
});

ipcMain.handle('import:openFileDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select POS Export File',
    filters: [
      { name: 'POS Export Files', extensions: ['xml', 'csv', 'txt'] },
      { name: 'XML Files', extensions: ['xml'] },
      { name: 'CSV Files', extensions: ['csv', 'txt'] },
    ],
    properties: ['openFile'],
  });
  return result;
});

// ── Item Audit ────────────────────────────────────────────────────────────────

ipcMain.handle('itemAudit:run', async () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  return itemAuditSvc.runAudit(activeStoreId, activeUserId);
});

ipcMain.handle('itemAudit:getPending', (_e, jobRunId?: string) => {
  if (!activeStoreId) return [];
  return itemAuditSvc.getPendingRecommendations(activeStoreId, jobRunId);
});

ipcMain.handle('itemAudit:approve', (_e, { recId, notes }: { recId: string; notes?: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  itemAuditSvc.approveRecommendation(recId, activeUserId, notes);
  auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId,
    eventType: 'recommendation', eventSubtype: 'item_approved',
    description: `Item recommendation ${recId} approved.`, entityId: recId });
  return { success: true };
});

ipcMain.handle('itemAudit:reject', (_e, { recId, notes }: { recId: string; notes?: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  itemAuditSvc.rejectRecommendation(recId, activeUserId, notes);
  auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId,
    eventType: 'recommendation', eventSubtype: 'item_rejected',
    description: `Item recommendation ${recId} rejected.`, entityId: recId });
  return { success: true };
});

// ── Pricing ───────────────────────────────────────────────────────────────────

ipcMain.handle('pricing:runAnalysis', async () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  return pricingSvc.runPricingAnalysis(activeStoreId, activeUserId);
});

ipcMain.handle('pricing:getPending', (_e, jobRunId?: string) => {
  if (!activeStoreId) return [];
  return pricingSvc.getPendingRecommendations(activeStoreId, jobRunId);
});

ipcMain.handle('pricing:approve', (_e, { recId, notes }: { recId: string; notes?: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  pricingSvc.approveRecommendation(recId, activeUserId, notes);
  return { success: true };
});

ipcMain.handle('pricing:reject', (_e, { recId, notes }: { recId: string; notes?: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  pricingSvc.rejectRecommendation(recId, activeUserId, notes);
  return { success: true };
});

ipcMain.handle('pricing:exportApproved', () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  const batchId = uuidv4();
  const changes = pricingSvc.exportApprovedChanges(activeStoreId, activeUserId, batchId);

  // Write export file
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const exportPath = path.join(EXPORT_DIR, `pricing_export_${batchId}.json`);
  fs.writeFileSync(exportPath, JSON.stringify({ batchId, changes }, null, 2));

  return { success: true, exportPath, count: (changes as unknown[]).length };
});

// ── Reports ───────────────────────────────────────────────────────────────────

ipcMain.handle('reports:generate', (_e, params: {
  reportType: string; startDate: string; endDate: string; [k: string]: unknown;
}) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  return reportSvc.generate({ ...params, storeId: activeStoreId, userId: activeUserId } as Parameters<typeof reportSvc.generate>[0]);
});

ipcMain.handle('reports:getArchive', () => {
  if (!activeStoreId) return [];
  return reportSvc.getArchive(activeStoreId);
});

ipcMain.handle('reports:getById', (_e, reportId: string) => {
  return reportSvc.getArchivedReport(reportId);
});

// ── PLU Items ─────────────────────────────────────────────────────────────────

ipcMain.handle('items:getAll', (_e, { limit = 100, offset = 0, search }: { limit?: number; offset?: number; search?: string }) => {
  if (!activeStoreId) return { items: [], total: 0 };
  const where = search
    ? `AND (p.description LIKE ? OR p.pos_plu_id LIKE ? OR sc.barcode LIKE ?)`
    : '';
  const params: unknown[] = [activeStoreId];
  if (search) { const q = `%${search}%`; params.push(q, q, q); }
  params.push(limit, offset);

  const items = dbService.all(
    `SELECT DISTINCT p.*, d.name as dept_name, c.name as cat_name,
            (SELECT GROUP_CONCAT(sc2.barcode,'|') FROM scan_codes sc2 WHERE sc2.plu_item_id=p.id) as barcodes
     FROM plu_items p
     LEFT JOIN departments d ON d.id=p.department_id
     LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN scan_codes sc ON sc.plu_item_id=p.id
     WHERE p.store_id=? AND p.is_active=1 ${where}
     ORDER BY p.description LIMIT ? OFFSET ?`,
    params
  );
  const total = (dbService.get<{ cnt: number }>(
    `SELECT COUNT(DISTINCT p.id) as cnt FROM plu_items p
     LEFT JOIN scan_codes sc ON sc.plu_item_id=p.id
     WHERE p.store_id=? AND p.is_active=1 ${where}`,
    params.slice(0, params.length - 2)
  ))?.cnt ?? 0;

  return { items, total };
});

// ── Departments / Categories ──────────────────────────────────────────────────

ipcMain.handle('departments:getAll', () => {
  if (!activeStoreId) return [];
  return dbService.all('SELECT * FROM departments WHERE store_id=? AND is_active=1 ORDER BY name', [activeStoreId]);
});

ipcMain.handle('categories:getAll', () => {
  if (!activeStoreId) return [];
  return dbService.all('SELECT * FROM categories WHERE store_id=? AND is_active=1 ORDER BY name', [activeStoreId]);
});

// ── Checklists ────────────────────────────────────────────────────────────────

ipcMain.handle('checklist:create', (_e, payload: {
  checklistType: string; operatorName: string; operatorInitials: string; shiftId?: string;
}) => {
  if (!activeStoreId) return { error: 'Not authenticated' };
  const id = uuidv4();
  const now = new Date().toISOString();
  const steps = getDefaultSteps(payload.checklistType);
  dbService.transaction(() => {
    dbService.run(
      `INSERT INTO shift_checklists(id,store_id,shift_id,checklist_type,operator_name,operator_initials,started_at,is_complete,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,0,?,?)`,
      [id, activeStoreId, payload.shiftId ?? null, payload.checklistType,
       payload.operatorName, payload.operatorInitials, now, now, now]
    );
    steps.forEach((s, i) => {
      dbService.run(
        `INSERT INTO checklist_steps(id,checklist_id,step_key,step_label,step_order,completed,created_at)
         VALUES(?,?,?,?,?,0,?)`,
        [uuidv4(), id, s.key, s.label, i, now]
      );
    });
  });
  return { id, steps };
});

ipcMain.handle('checklist:getWithSteps', (_e, checklistId: string) => {
  const checklist = dbService.get('SELECT * FROM shift_checklists WHERE id=?', [checklistId]);
  const steps = dbService.all('SELECT * FROM checklist_steps WHERE checklist_id=? ORDER BY step_order', [checklistId]);
  return { checklist, steps };
});

ipcMain.handle('checklist:completeStep', (_e, { stepId, value, notes }: { stepId: string; value?: number; notes?: string }) => {
  const now = new Date().toISOString();
  dbService.run(
    `UPDATE checklist_steps SET completed=1, completed_at=?, completed_by=?, numeric_value=?, notes=? WHERE id=?`,
    [now, activeUserId, value ?? null, notes ?? null, stepId]
  );
  return { success: true };
});

ipcMain.handle('checklist:finalize', (_e, { checklistId, notes, overShort }: { checklistId: string; notes?: string; overShort?: number }) => {
  const now = new Date().toISOString();
  dbService.run(
    `UPDATE shift_checklists SET is_complete=1, completed_at=?, manager_notes=?, over_short_amount=?, updated_at=? WHERE id=?`,
    [now, notes ?? null, overShort ?? 0, now, checklistId]
  );
  auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId ?? undefined,
    eventType: 'checklist', eventSubtype: 'finalized',
    description: `Checklist ${checklistId} finalized.`, entityId: checklistId });
  return { success: true };
});

ipcMain.handle('checklist:getHistory', () => {
  if (!activeStoreId) return [];
  return dbService.all(
    `SELECT * FROM shift_checklists WHERE store_id=? ORDER BY started_at DESC LIMIT 50`,
    [activeStoreId]
  );
});

// ── Audit Log ────────────────────────────────────────────────────────────────

ipcMain.handle('auditLog:getRecent', (_e, { limit = 100, offset = 0 } = {}) => {
  if (!activeStoreId) return [];
  return auditLogger.getRecent(activeStoreId, limit, offset);
});

// ── File operations ───────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', (_e, filePath: string) => {
  shell.openPath(filePath);
});

ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
  shell.showItemInFolder(filePath);
});

// ─── Checklist step templates ─────────────────────────────────────────────────

function getDefaultSteps(type: string): { key: string; label: string }[] {
  switch (type) {
    case 'shift_open':
      return [
        { key: 'verify_cash_drawer',  label: 'Count and verify opening cash drawer' },
        { key: 'check_receipt_paper', label: 'Check receipt paper supply' },
        { key: 'check_lottery',       label: 'Check lottery ticket dispensers' },
        { key: 'check_tobacco_stock', label: 'Verify tobacco stock behind counter' },
        { key: 'review_notes',        label: 'Review notes from previous shift' },
        { key: 'confirm_open',        label: 'Confirm register is open and ready' },
      ];
    case 'shift_close':
      return [
        { key: 'final_void_review',  label: 'Review any voids or refunds this shift' },
        { key: 'count_cash_drawer',  label: 'Count cash drawer total' },
        { key: 'safe_drop',          label: 'Complete safe drop (record amount)' },
        { key: 'record_over_short',  label: 'Record over/short amount' },
        { key: 'lottery_settle',     label: 'Settle lottery if required' },
        { key: 'notes_for_next',     label: 'Leave notes for next shift' },
        { key: 'secure_area',        label: 'Secure area and confirm handoff' },
      ];
    case 'day_close':
      return [
        { key: 'all_shifts_closed',  label: 'Confirm all shifts are closed' },
        { key: 'count_safe',         label: 'Count and record safe total' },
        { key: 'run_eod_report',     label: 'Run end-of-day report' },
        { key: 'fuel_reconcile',     label: 'Fuel reconciliation (if applicable)' },
        { key: 'lottery_close',      label: 'Lottery close-out' },
        { key: 'bank_deposit',       label: 'Prepare bank deposit' },
        { key: 'manager_review',     label: 'Manager review and sign-off' },
        { key: 'backup_confirm',     label: 'Confirm data backup completed' },
      ];
    default:
      return [
        { key: 'step_1', label: 'Step 1 – Complete task' },
        { key: 'step_2', label: 'Step 2 – Verify completion' },
        { key: 'step_3', label: 'Step 3 – Manager sign-off' },
      ];
  }
}
