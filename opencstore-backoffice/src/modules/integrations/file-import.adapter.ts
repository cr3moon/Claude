/**
 * src/modules/integrations/file-import.adapter.ts
 *
 * File-based import adapter.
 * Supports XML PLU files and CSV pricebook / transaction exports.
 * This is the recommended integration path for sites where a live POS
 * connection is not yet available.
 *
 * write-back: exports an approved-changes file that the operator
 * manually imports into their POS back-office.  No direct POS write
 * is ever attempted.
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
import { XmlPluParser } from '../../../integrations/parsers/XmlPluParser';
import { CsvPluParser } from '../../../integrations/parsers/CsvPluParser';

export class FileImportAdapter implements IPosAdapter {
  readonly adapterType: AdapterType = 'file_import';

  readonly capabilities: AdapterCapabilities = {
    adapterType:         'file_import',
    canConnect:          true,
    canReadItems:        true,
    canReadSales:        true,
    canWriteItems:       false,
    canWritePrices:      false,
    canBackup:           true,
    supportsRealTime:    false,
    supportedFormats:    ['xml_plu', 'csv_pricebook', 'csv_transactions', 'csv_departments'],
    writeRequiresLogout: true,
    disclaimer:
      'File Import mode reads XML and CSV exports from your POS back-office. ' +
      'Approved changes are exported as a file for manual import into the POS. ' +
      'No direct POS connection is made.',
  };

  private config: ConnectionConfig | null = null;
  private xmlParser = new XmlPluParser();
  private csvParser = new CsvPluParser();

  configure(config: ConnectionConfig): void {
    this.config = config;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      success:  true,
      message:  'File import mode is ready.  Select a file to import.',
    };
  }

  async connect(): Promise<ConnectionTestResult> {
    return this.testConnection();
  }

  async backup(options: BackupOptions): Promise<BackupResult> {
    const fileName = `file_import_backup_${options.backupType}_${Date.now()}.json`;
    const filePath = path.join(options.destinationDir, fileName);
    const manifest = {
      source:     'file_import_adapter',
      backupType: options.backupType,
      createdAt:  new Date().toISOString(),
      note:       'File-import backup manifest – no live POS data.',
    };
    try {
      fs.mkdirSync(options.destinationDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
      return { success: true, filePath, message: 'Backup manifest created.' };
    } catch (err) {
      return { success: false, filePath, message: `Backup failed: ${(err as Error).message}` };
    }
  }

  async importFile(options: ImportFileOptions): Promise<ImportResult> {
    const jobId = uuidv4();
    if (!fs.existsSync(options.filePath)) {
      return {
        jobId, format: options.format,
        recordsTotal: 0, recordsOk: 0, recordsSkipped: 0, recordsError: 1,
        errors: [{ message: `File not found: ${options.filePath}` }],
        dryRun: options.dryRun ?? false,
      };
    }

    const content = fs.readFileSync(options.filePath, 'utf-8');
    let parsed: { items?: unknown[]; departments?: unknown[]; categories?: unknown[] } = {};

    try {
      if (options.format === 'xml_plu') {
        parsed = this.xmlParser.parse(content);
      } else {
        parsed = this.csvParser.parse(content, options.format);
      }
    } catch (err) {
      return {
        jobId, format: options.format,
        recordsTotal: 0, recordsOk: 0, recordsSkipped: 0, recordsError: 1,
        errors: [{ message: `Parse error: ${(err as Error).message}` }],
        dryRun: options.dryRun ?? false,
      };
    }

    const total = (parsed.items?.length ?? 0) +
                  (parsed.departments?.length ?? 0) +
                  (parsed.categories?.length ?? 0);

    return {
      jobId, format: options.format,
      recordsTotal:   total,
      recordsOk:      total,
      recordsSkipped: 0,
      recordsError:   0,
      errors:         [],
      dryRun:         options.dryRun ?? false,
    };
  }

  async validateChanges(changeSet: ChangeSet): Promise<ValidationResult> {
    const warnings = changeSet.changes
      .filter(c => c.newValue === '' || c.newValue === null)
      .map(c => ({
        code:      'EMPTY_VALUE',
        entityId:  c.entityId,
        field:     c.field,
        message:   `"${c.field}" on ${c.entityId} would be set to empty.`,
        severity:  'warning' as const,
      }));

    const errors: typeof warnings = [];

    return {
      valid:        errors.length === 0,
      warnings,
      errors,
      dryRunReport: `Validated ${changeSet.changes.length} change(s). ${warnings.length} warning(s).`,
    };
  }

  async applyChanges(changeSet: ChangeSet, backupConfirmId: string): Promise<ApplyResult> {
    if (!backupConfirmId) {
      return { success: false, appliedCount: 0, failedCount: changeSet.changes.length,
               rollbackAvailable: false, message: 'Backup confirmation ID required.' };
    }
    if (this.config?.readOnly) {
      return { success: false, appliedCount: 0, failedCount: changeSet.changes.length,
               rollbackAvailable: false, message: 'Adapter is in read-only mode.' };
    }
    // Export to JSON file for manual POS import
    const exportDir  = path.join(process.env['HOME'] ?? '.', '.opencstore', 'exports');
    const exportPath = path.join(exportDir, `changes_${changeSet.batchId}.json`);
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, JSON.stringify(changeSet, null, 2));
    return {
      success:           true,
      appliedCount:      changeSet.changes.length,
      failedCount:       0,
      exportFilePath:    exportPath,
      rollbackAvailable: true,
      message:           `Changes exported to ${exportPath}. Import this file in your POS back-office.`,
    };
  }

  getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  async disconnect(): Promise<void> { /* no-op */ }
}
