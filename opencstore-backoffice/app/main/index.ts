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
import { InventoryService } from '../../backend/services/InventoryService';
import { LotteryService } from '../../backend/services/LotteryService';
import { TimeClockService } from '../../backend/services/TimeClockService';
import { StoreAccessService } from '../../backend/services/StoreAccessService';
import { AuditLogger } from '../../audit/AuditLogger';
import { MockVerifoneAdapter } from '../../integrations/adapters/MockVerifoneAdapter';
import { CommanderNaxmlClient, CommanderFaultError } from '../../integrations/commander/CommanderNaxmlClient';

// ─── Paths ────────────────────────────────────────────────────────────────────

const USER_DATA = app.getPath('userData');
const DB_PATH   = path.join(USER_DATA, 'opencstore.db');
const BACKUP_DIR = path.join(USER_DATA, 'backups');
const EXPORT_DIR = path.join(USER_DATA, 'exports');

// Bundled read-only assets (schema, sample data). In a packaged build these
// ship under extraResources; in dev, this file runs compiled three levels
// deep at dist-electron/app/main/index.js, so climb back out to the repo root.
const APP_ROOT = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', '..', '..');
const SCHEMA_PATH      = path.join(APP_ROOT, 'database', 'schema.sql');
const SAMPLE_DATA_DIR  = path.join(APP_ROOT, 'sample-data');

// ─── Services (singleton per process) ────────────────────────────────────────

const dbService   = new DatabaseService(DB_PATH, SCHEMA_PATH);
const auditLogger = new AuditLogger(dbService);
const importSvc   = new ImportService(dbService, auditLogger);
const itemAuditSvc = new ItemAuditService(dbService, auditLogger);
const pricingSvc  = new PricingService(dbService, auditLogger);
const inventorySvc = new InventoryService(dbService, auditLogger);
const lotterySvc  = new LotteryService(dbService, auditLogger);
const timeClockSvc = new TimeClockService(dbService, auditLogger);
const storeAccessSvc = new StoreAccessService(dbService, auditLogger);
const reportSvc   = new ReportService(dbService, auditLogger, inventorySvc, lotterySvc, timeClockSvc);

// Active session state (lightweight, no persistence needed for MVP)
let activeUserId: string | null = null;
let activeStoreId: string | null = null;

// Live Commander NAXML connection, if any. Held in memory only — the
// password is never written to disk (see connection_settings, which stores
// host/port/username only). Lost on app restart; the operator reconnects.
let commanderClient: CommanderNaxmlClient | null = null;

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

  if (!app.isPackaged) {
    // npm run dev never sets VITE_DEV_SERVER_URL (setting env vars from an
    // npm script is shell-dependent — cmd.exe, PowerShell, and bash all
    // spell it differently), so fall back to the fixed dev port from
    // vite.config.ts rather than requiring the caller to pass it in.
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // dist/renderer ships inside the packaged app itself (declared in
    // build.files), not under extraResources like schema.sql/sample-data,
    // so use app.getAppPath() here rather than APP_ROOT.
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  dbService.open();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(err => {
  // Without this, a startup failure (missing schema file, locked DB, etc.)
  // leaves the app running with zero windows and no visible indication why.
  console.error('Failed to start OpenCStore Back Office:', err);
  dialog.showErrorBox(
    'OpenCStore Back Office failed to start',
    String(err instanceof Error ? err.stack ?? err.message : err)
  );
  app.exit(1);
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

ipcMain.handle('app:getOnboardingState', () => ({
  completed: dbService.isOnboardingComplete(),
}));

ipcMain.handle('app:getCurrentUser', () => {
  if (!activeUserId) return null;
  const user = dbService.get<{
    id: string; username: string; display_name: string; role: string; store_id: string;
  }>('SELECT id, username, display_name, role, store_id FROM users WHERE id=?', [activeUserId]);
  return user ?? null;
});

// ── Auth ─────────────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_e, { username, password }: { username: string; password: string }) => {
  const user = dbService.getUserByUsername(username) as {
    id: string; password_hash: string; display_name: string; role: string; store_id: string;
  } | undefined;

  if (!user) {
    auditLogger.log({ eventType: 'auth', eventSubtype: 'login_failed',
      description: `Login failed: unknown user "${username}"`, result: 'failure' });
    return { ok: false, error: 'Invalid username or password.' };
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    auditLogger.log({ storeId: user.store_id, eventType: 'auth', eventSubtype: 'login_failed',
      description: `Login failed for user ${username}`, result: 'failure' });
    return { ok: false, error: 'Invalid username or password.' };
  }

  activeUserId  = user.id;
  activeStoreId = user.store_id;

  auditLogger.log({ storeId: user.store_id, userId: user.id, eventType: 'auth', eventSubtype: 'login',
    description: `User "${user.display_name}" logged in.` });

  return {
    ok: true,
    user: { id: user.id, username, display_name: user.display_name, role: user.role, store_id: user.store_id },
  };
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

  const storeId = dbService.createStore(store);
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

ipcMain.handle('dashboard:getMetrics', () => {
  if (!activeStoreId) return { error: 'Not authenticated' };
  const totalSkus = (dbService.get<{ n: number }>(
    'SELECT COUNT(*) as n FROM plu_items WHERE store_id=? AND is_active=1', [activeStoreId]
  ))?.n ?? 0;
  const pendingAuditItems = (dbService.get<{ n: number }>(
    "SELECT COUNT(*) as n FROM item_recommendations WHERE store_id=? AND status='pending'", [activeStoreId]
  ))?.n ?? 0;
  const pendingPriceChanges = (dbService.get<{ n: number }>(
    "SELECT COUNT(*) as n FROM pricing_recommendations WHERE store_id=? AND status IN ('pending','approved')", [activeStoreId]
  ))?.n ?? 0;
  const openShifts = (dbService.get<{ n: number }>(
    "SELECT COUNT(*) as n FROM shifts WHERE store_id=? AND status='open'", [activeStoreId]
  ))?.n ?? 0;
  const lastImport = dbService.get<{ completed_at: string; status: string }>(
    'SELECT completed_at, status FROM import_jobs WHERE store_id=? ORDER BY created_at DESC LIMIT 1',
    [activeStoreId]
  );
  return {
    totalSkus,
    pendingAuditItems,
    pendingPriceChanges,
    openShifts,
    lastImportAt:     lastImport?.completed_at ?? null,
    lastImportStatus: lastImport?.status ?? null,
  };
});

ipcMain.handle('dashboard:getRecentAuditItems', () => {
  if (!activeStoreId) return [];
  return dbService.all(
    `SELECT r.id, p.pos_plu_id, p.description, r.rule_code, r.created_at
     FROM item_recommendations r
     JOIN plu_items p ON p.id = r.plu_item_id
     WHERE r.store_id=? AND r.status='pending'
     ORDER BY r.created_at DESC LIMIT 10`,
    [activeStoreId]
  );
});

// ── Store ────────────────────────────────────────────────────────────────────

ipcMain.handle('store:get', () => {
  if (!activeStoreId) return undefined;
  return dbService.getStore(activeStoreId);
});

ipcMain.handle('store:update', (_e, data: Partial<{
  name: string; address: string; city: string; state: string; zip: string; phone: string;
  timezone: string; tax_rate: number; fuel_tax_rate: number; pos_type: string;
}>) => {
  if (!activeUserId || !activeStoreId) return { error: 'Not authenticated' };
  const existing = dbService.getStore(activeStoreId);
  if (!existing) return { error: 'Store not found' };

  dbService.updateStore(activeStoreId, {
    name:          (data.name ?? existing.name) as string,
    address:       (data.address ?? existing.address) as string | undefined,
    city:          (data.city ?? existing.city) as string | undefined,
    state:         (data.state ?? existing.state) as string | undefined,
    zip:           (data.zip ?? existing.zip) as string | undefined,
    phone:         (data.phone ?? existing.phone) as string | undefined,
    timezone:      (data.timezone ?? existing.timezone) as string,
    tax_rate:      (data.tax_rate ?? existing.tax_rate) as number,
    fuel_tax_rate: (data.fuel_tax_rate ?? existing.fuel_tax_rate) as number,
    pos_type:      (data.pos_type ?? existing.pos_type) as string | undefined,
  });

  auditLogger.log({ storeId: activeStoreId, userId: activeUserId,
    eventType: 'settings', eventSubtype: 'store_updated',
    description: `Store settings updated: ${Object.keys(data).join(', ')}` });

  return { success: true };
});

// ── Multi-store access ───────────────────────────────────────────────────────

ipcMain.handle('store:listAccessible', () => {
  if (!activeUserId) return [];
  return storeAccessSvc.listAccessibleStores(activeUserId);
});

ipcMain.handle('store:create', (_e, data: Parameters<typeof storeAccessSvc.createStore>[1]) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  try {
    const storeId = storeAccessSvc.createStore(activeUserId, data);
    return { success: true, storeId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('store:switchActive', (_e, storeId: string) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  try {
    activeStoreId = storeAccessSvc.validateSwitch(activeUserId, storeId);
    auditLogger.log({ storeId: activeStoreId, userId: activeUserId,
      eventType: 'store', eventSubtype: 'switched',
      description: `Switched active store.` });
    return { success: true, store: dbService.getStore(activeStoreId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('store:grantAccess', (_e, { userId, storeId }: { userId: string; storeId: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  try {
    storeAccessSvc.grantAccess(userId, storeId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('store:revokeAccess', (_e, { userId, storeId }: { userId: string; storeId: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  try {
    storeAccessSvc.revokeAccess(userId, storeId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('store:listAllUsers', () => {
  if (!activeUserId) return [];
  return storeAccessSvc.listAllUsers();
});

ipcMain.handle('store:listAccessibleFor', (_e, userId: string) => {
  if (!activeUserId) return [];
  return storeAccessSvc.listAccessibleStores(userId);
});

ipcMain.handle('store:getMultiStoreSummary', () => {
  if (!activeUserId) return [];
  return storeAccessSvc.getMultiStoreSummary(activeUserId);
});

// ── Commander NAXML connection ──────────────────────────────────────────────
//
// Real connection to a Verifone Commander site controller's NAXML CGI API,
// per github.com/cr3moon/commander-deconstructed. This is a separate concern
// from the PLU/pricebook IPosAdapter integrations above — Commander's NAXML
// API covers fuel pricing and fuel totals, not the inside-store item catalog.

ipcMain.handle('commander:testConnection', async (_e, config: {
  host: string; port?: number; username: string; password: string;
}) => {
  if (!activeUserId || !activeStoreId) return { success: false, message: 'Not authenticated' };

  const client = new CommanderNaxmlClient(config);
  const result = await client.testConnection();

  const now = new Date().toISOString();
  const existing = dbService.get<{ id: string }>(
    "SELECT id FROM connection_settings WHERE store_id=? AND adapter_type='commander'",
    [activeStoreId]
  );
  const values = [
    config.host, config.port ?? 443, config.username, 1, 1,
    result.success ? 'ok' : 'failed', now, now, activeStoreId,
  ];
  if (existing) {
    dbService.run(
      `UPDATE connection_settings SET host=?, port=?, username_hint=?, use_ssl=?, read_only=?,
       connection_status=?, last_tested_at=?, updated_at=? WHERE store_id=? AND adapter_type='commander'`,
      values
    );
  } else {
    dbService.run(
      `INSERT INTO connection_settings(id,store_id,adapter_type,host,port,username_hint,use_ssl,read_only,
       connection_status,last_tested_at,created_at,updated_at)
       VALUES(?,?,'commander',?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), activeStoreId, config.host, config.port ?? 443, config.username, 1, 1,
       result.success ? 'ok' : 'failed', now, now, now]
    );
  }

  commanderClient = result.success ? client : null;

  auditLogger.log({ storeId: activeStoreId, userId: activeUserId,
    eventType: 'connection', eventSubtype: result.success ? 'commander_connected' : 'commander_connect_failed',
    description: `Commander connection test to ${config.host}: ${result.message}` });

  return result;
});

ipcMain.handle('commander:getConnectionSettings', () => {
  if (!activeStoreId) return null;
  return dbService.get(
    "SELECT host, port, username_hint, connection_status, last_tested_at FROM connection_settings WHERE store_id=? AND adapter_type='commander'",
    [activeStoreId]
  ) ?? null;
});

ipcMain.handle('commander:getFuelPrices', async () => {
  if (!commanderClient) return { error: 'Not connected. Test the connection first.' };
  try {
    return await commanderClient.getFuelPrices();
  } catch (err) {
    return { error: err instanceof CommanderFaultError ? err.message : String(err) };
  }
});

ipcMain.handle('commander:getFuelTotals', async (_e, period: 1 | 2 | 3 | 4) => {
  if (!commanderClient) return { error: 'Not connected. Test the connection first.' };
  try {
    return await commanderClient.getFuelTotals(period);
  } catch (err) {
    return { error: err instanceof CommanderFaultError ? err.message : String(err) };
  }
});

ipcMain.handle('commander:getPumpMaintenanceTotals', async () => {
  if (!commanderClient) return { error: 'Not connected. Test the connection first.' };
  try {
    return await commanderClient.getPumpMaintenanceTotals();
  } catch (err) {
    return { error: err instanceof CommanderFaultError ? err.message : String(err) };
  }
});

// Per-site allow-list of which fuel grades to display (e.g. a site with a
// Commander unit configured with unused/legacy grades it doesn't sell).
// Stored as a JSON array under a single app_settings key — this app is
// single-store per install, so no store_id scoping is needed (same pattern
// as onboarding_complete). Empty array or unset means "no filter, show all".
const VISIBLE_GRADES_KEY = 'commander_visible_grades';

ipcMain.handle('commander:getVisibleGrades', (): string[] | null => {
  const raw = dbService.getSetting(VISIBLE_GRADES_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
});

ipcMain.handle('commander:setVisibleGrades', (_e, grades: string[]) => {
  dbService.setSetting(
    VISIBLE_GRADES_KEY,
    JSON.stringify(grades),
    "Fuel grades to display for this site's Commander connection (empty = show all)"
  );
  return { success: true };
});

// ── Settings ─────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get', () => {
  const rows = dbService.all<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings', []
  );
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
});

ipcMain.handle('settings:save', (_e, data: Record<string, string>) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  const now = new Date().toISOString();
  dbService.transaction(() => {
    for (const [key, value] of Object.entries(data)) {
      dbService.run(
        `INSERT INTO app_settings(key, value, updated_at) VALUES(?,?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
        [key, String(value), now]
      );
    }
  });
  auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId,
    eventType: 'settings', eventSubtype: 'updated',
    description: `Settings updated: ${Object.keys(data).join(', ')}` });
  return { success: true };
});

// ── Shifts ───────────────────────────────────────────────────────────────────

ipcMain.handle('shifts:getAll', () => {
  if (!activeStoreId) return [];
  return dbService.all(
    `SELECT s.*, u.display_name as cashier_name
     FROM shifts s
     LEFT JOIN users u ON u.id = s.cashier_user_id
     WHERE s.store_id=?
     ORDER BY s.opened_at DESC LIMIT 50`,
    [activeStoreId]
  );
});

ipcMain.handle('shifts:open', () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  const id  = uuidv4();
  const now = new Date().toISOString();
  dbService.run(
    `INSERT INTO shifts(id, store_id, cashier_user_id, status, opened_at, created_at, updated_at)
     VALUES(?,?,?,'open',?,?,?)`,
    [id, activeStoreId, activeUserId, now, now, now]
  );
  auditLogger.log({ storeId: activeStoreId, userId: activeUserId,
    eventType: 'shift', eventSubtype: 'opened',
    description: 'Shift opened.', entityId: id });
  return { id, status: 'open', opened_at: now };
});

ipcMain.handle('shifts:close', (_e, { shiftId }: { shiftId: string }) => {
  if (!activeUserId) return { error: 'Not authenticated' };
  const now = new Date().toISOString();
  dbService.run(
    `UPDATE shifts SET status='closed', closed_at=?, updated_at=? WHERE id=?`,
    [now, now, shiftId]
  );
  auditLogger.log({ storeId: activeStoreId ?? undefined, userId: activeUserId,
    eventType: 'shift', eventSubtype: 'closed',
    description: `Shift ${shiftId} closed.`, entityId: shiftId });
  return { success: true };
});

// ── Import ───────────────────────────────────────────────────────────────────

ipcMain.handle('import:runMockImport', async () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };

  const adapter = new MockVerifoneAdapter(SAMPLE_DATA_DIR);
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

  const adapter = new MockVerifoneAdapter(SAMPLE_DATA_DIR);
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

// ── Inventory (vendors, receiving, on-hand tracking) ──────────────────────────

ipcMain.handle('inventory:listVendors', () => {
  if (!activeStoreId) return [];
  return inventorySvc.listVendors(activeStoreId);
});

ipcMain.handle('inventory:createVendor', (_e, data: Parameters<typeof inventorySvc.createVendor>[2]) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    const id = inventorySvc.createVendor(activeStoreId, activeUserId, data);
    return { success: true, id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('inventory:createDelivery', (_e, { vendorId, invoiceNumber, notes }: { vendorId: string; invoiceNumber?: string; notes?: string }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    const id = inventorySvc.createDelivery(activeStoreId, activeUserId, vendorId, invoiceNumber, notes);
    return { success: true, id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('inventory:addDeliveryLine', (_e, { deliveryId, line }: { deliveryId: string; line: Parameters<typeof inventorySvc.addDeliveryLine>[2] }) => {
  if (!activeStoreId) return { error: 'Not authenticated' };
  try {
    inventorySvc.addDeliveryLine(deliveryId, activeStoreId, line);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('inventory:getDelivery', (_e, deliveryId: string) => {
  if (!activeStoreId) return null;
  return inventorySvc.getDelivery(deliveryId, activeStoreId);
});

ipcMain.handle('inventory:listDeliveries', () => {
  if (!activeStoreId) return [];
  return inventorySvc.listDeliveries(activeStoreId);
});

ipcMain.handle('inventory:receiveDelivery', (_e, deliveryId: string) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    inventorySvc.receiveDelivery(deliveryId, activeStoreId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('inventory:createAdjustment', (_e, { pluItemId, qtyDelta, reasonCode, notes }: {
  pluItemId: string; qtyDelta: number; reasonCode: Parameters<typeof inventorySvc.createAdjustment>[4]; notes?: string;
}) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    inventorySvc.createAdjustment(activeStoreId, activeUserId, pluItemId, qtyDelta, reasonCode, notes);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('inventory:getOnHandLevels', () => {
  if (!activeStoreId) return [];
  return inventorySvc.getOnHandLevels(activeStoreId);
});

ipcMain.handle('inventory:getValuation', () => {
  if (!activeStoreId) return { totalValue: 0, itemCount: 0, lowStockCount: 0 };
  return inventorySvc.getInventoryValuation(activeStoreId);
});

// ── Lottery (instant tickets) ──────────────────────────────────────────────────

ipcMain.handle('lottery:listGames', () => {
  if (!activeStoreId) return [];
  return lotterySvc.listGames(activeStoreId);
});

ipcMain.handle('lottery:createGame', (_e, data: Parameters<typeof lotterySvc.createGame>[2]) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    const id = lotterySvc.createGame(activeStoreId, activeUserId, data);
    return { success: true, id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('lottery:receiveBook', (_e, { gameId, bookNumber }: { gameId: string; bookNumber: string }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    const id = lotterySvc.receiveBook(activeStoreId, activeUserId, gameId, bookNumber);
    return { success: true, id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('lottery:activateBook', (_e, bookId: string) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    lotterySvc.activateBook(bookId, activeStoreId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('lottery:recordCount', (_e, { bookId, ticketNumber }: { bookId: string; ticketNumber: number }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    lotterySvc.recordCount(bookId, activeStoreId, activeUserId, ticketNumber);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('lottery:returnBook', (_e, bookId: string) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    lotterySvc.returnBook(bookId, activeStoreId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('lottery:listBooks', () => {
  if (!activeStoreId) return [];
  return lotterySvc.listBooks(activeStoreId);
});

// ── Time Clock ──────────────────────────────────────────────────────────────────

ipcMain.handle('timeClock:getMyStatus', () => {
  if (!activeUserId) return null;
  return timeClockSvc.getOpenEntry(activeUserId);
});

ipcMain.handle('timeClock:clockIn', () => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    timeClockSvc.clockIn(activeStoreId, activeUserId);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('timeClock:clockOut', (_e, breakMinutes: number) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    timeClockSvc.clockOut(activeStoreId, activeUserId, breakMinutes);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('timeClock:listMyEntries', () => {
  if (!activeStoreId || !activeUserId) return [];
  return timeClockSvc.listEntries(activeStoreId, activeUserId);
});

ipcMain.handle('timeClock:listActiveUsers', () => {
  if (!activeStoreId) return [];
  return timeClockSvc.listActiveUsers(activeStoreId);
});

ipcMain.handle('timeClock:listEntries', () => {
  if (!activeStoreId) return [];
  return timeClockSvc.listEntries(activeStoreId);
});

ipcMain.handle('timeClock:editEntry', (_e, data: { entryId: string; clockIn: string; clockOut: string; breakMinutes: number; reason: string }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  try {
    timeClockSvc.editEntry(data.entryId, activeStoreId, activeUserId, data.clockIn, data.clockOut, data.breakMinutes, data.reason);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
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

/** New-style: start a checklist from a template id (e.g. 'shift_open') */
ipcMain.handle('checklist:start', (_e, { templateId }: { templateId: string }) => {
  if (!activeStoreId || !activeUserId) return { error: 'Not authenticated' };
  const id  = uuidv4();
  const now = new Date().toISOString();
  const steps = getDefaultSteps(templateId);
  dbService.transaction(() => {
    dbService.run(
      `INSERT INTO shift_checklists(id,store_id,checklist_type,operator_name,operator_initials,started_at,is_complete,created_at,updated_at)
       VALUES(?,?,?,
         (SELECT display_name FROM users WHERE id=?),
         (SELECT UPPER(SUBSTR(display_name,1,2)) FROM users WHERE id=?),
         ?,0,?,?)`,
      [id, activeStoreId, templateId, activeUserId, activeUserId, now, now, now]
    );
    steps.forEach((s, i) => {
      dbService.run(
        `INSERT INTO checklist_steps(id,checklist_id,step_key,step_label,step_order,completed,created_at)
         VALUES(?,?,?,?,?,0,?)`,
        [uuidv4(), id, s.key, s.label, i, now]
      );
    });
  });
  auditLogger.log({ storeId: activeStoreId, userId: activeUserId,
    eventType: 'checklist', eventSubtype: 'started',
    description: `Checklist "${templateId}" started.`, entityId: id });
  return { id, templateId, steps };
});

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
