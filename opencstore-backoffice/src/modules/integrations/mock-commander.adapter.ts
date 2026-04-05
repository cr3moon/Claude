/**
 * src/modules/integrations/mock-commander.adapter.ts
 *
 * Full-featured mock adapter for development, demos, and first-run experience.
 * Returns synthetic data from the bundled sample files without requiring any
 * live POS connection.
 *
 * NOT an official Verifone or Gilbarco product – purely illustrative.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  IPosAdapter,
  AdapterType,
  AdapterCapabilities,
  ConnectionConfig,
  ConnectionTestResult,
  BackupOptions,
  BackupResult,
  ImportFileOptions,
  ImportResult,
  ChangeSet,
  ValidationResult,
  ApplyResult,
} from './types';

export class MockCommanderAdapter implements IPosAdapter {
  readonly adapterType: AdapterType = 'mock_commander';

  readonly capabilities: AdapterCapabilities = {
    adapterType:         'mock_commander',
    canConnect:          true,
    canReadItems:        true,
    canReadSales:        true,
    canWriteItems:       false, // mock always exports, never writes to a real POS
    canWritePrices:      false,
    canBackup:           true,
    supportsRealTime:    false,
    supportedFormats:    ['xml_plu', 'csv_pricebook', 'csv_transactions', 'csv_departments'],
    writeRequiresLogout: true,
    disclaimer:
      'MOCK ADAPTER: No live POS connection. ' +
      'Sample data is loaded from bundled files. ' +
      'Use this mode to explore the app without a POS.',
  };

  private config: ConnectionConfig | null = null;

  configure(config: ConnectionConfig): void {
    this.config = { ...config, readOnly: true }; // mock is always read-only
  }

  async testConnection(): Promise<ConnectionTestResult> {
    await this.delay(150);
    return { success: true, latencyMs: 150, serverVersion: 'Mock v1.0', message: 'Mock adapter ready.' };
  }

  async connect(): Promise<ConnectionTestResult> {
    await this.delay(200);
    return { success: true, latencyMs: 200, serverVersion: 'Mock v1.0', message: 'Connected to mock adapter.' };
  }

  async backup(options: BackupOptions): Promise<BackupResult> {
    await this.delay(200);
    const fileName = `mock_backup_${options.backupType}_${Date.now()}.json`;
    const filePath = path.join(options.destinationDir, fileName);
    const content  = JSON.stringify({
      source: 'mock_commander', backupType: options.backupType,
      createdAt: new Date().toISOString(), note: 'Mock backup – no real POS data.',
    }, null, 2);
    try {
      fs.mkdirSync(options.destinationDir, { recursive: true });
      fs.writeFileSync(filePath, content);
      return { success: true, filePath, fileSizeBytes: Buffer.byteLength(content), message: 'Mock backup created.' };
    } catch (err) {
      return { success: false, filePath, message: `Mock backup failed: ${(err as Error).message}` };
    }
  }

  async importFile(options: ImportFileOptions): Promise<ImportResult> {
    await this.delay(300);
    // If a real file path was given use it; otherwise fall back to bundled sample
    const resolvedPath = options.filePath && fs.existsSync(options.filePath)
      ? options.filePath
      : this.samplePath(options.format);

    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      return this.notFound(options);
    }

    // The actual parsing is handled by ImportService in the main process;
    // here we just return a success shape so callers know the file is accessible.
    const stat = fs.statSync(resolvedPath);
    return {
      jobId:          uuidv4(),
      format:         options.format,
      recordsTotal:   -1,      // -1 = will be counted by ImportService
      recordsOk:      -1,
      recordsSkipped: 0,
      recordsError:   0,
      errors:         [],
      dryRun:         options.dryRun ?? false,
      backupId:       undefined,
    };
  }

  async validateChanges(changeSet: ChangeSet): Promise<ValidationResult> {
    await this.delay(200);
    const warnings = changeSet.changes
      .filter(c => c.newValue === '' || c.newValue === null)
      .map(c => ({
        code: 'EMPTY_VALUE', entityId: c.entityId, field: c.field,
        message: `"${c.field}" on ${c.entityId} would be set to empty.`,
        severity: 'warning' as const,
      }));
    return {
      valid:        true,
      warnings,
      errors:       [],
      dryRunReport: `Mock dry-run: ${changeSet.changes.length} change(s), ${warnings.length} warning(s).`,
    };
  }

  async applyChanges(changeSet: ChangeSet, backupConfirmId: string): Promise<ApplyResult> {
    await this.delay(400);
    if (!backupConfirmId) {
      return { success: false, appliedCount: 0, failedCount: changeSet.changes.length,
               rollbackAvailable: false, message: 'Backup confirmation required.' };
    }
    const exportDir  = path.join(process.env['HOME'] ?? '.', '.opencstore', 'exports');
    const exportPath = path.join(exportDir, `mock_changes_${changeSet.batchId}.json`);
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, JSON.stringify(changeSet, null, 2));
    return {
      success:           true,
      appliedCount:      changeSet.changes.length,
      failedCount:       0,
      exportFilePath:    exportPath,
      rollbackAvailable: true,
      message:           `Mock export written to ${exportPath}.`,
    };
  }

  getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  async disconnect(): Promise<void> { /* no-op */ }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private samplePath(format: string): string {
    const map: Record<string, string> = {
      xml_plu:          'sample-data/mock-plu.xml',
      csv_pricebook:    'sample-data/mock-pricebook.csv',
      csv_transactions: 'sample-data/sample-sales.csv',
      csv_departments:  'sample-data/mock-pricebook.csv',
    };
    const rel = map[format];
    return rel ? path.join(__dirname, '..', '..', '..', '..', rel) : '';
  }

  private notFound(options: ImportFileOptions): ImportResult {
    return {
      jobId: uuidv4(), format: options.format,
      recordsTotal: 0, recordsOk: 0, recordsSkipped: 0, recordsError: 1,
      errors: [{ message: `Sample file for format "${options.format}" not found.` }],
      dryRun: options.dryRun ?? false,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }
}
