/**
 * src/modules/integrations/commander.adapter.ts
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  PLACEHOLDER ADAPTER – NOT FUNCTIONAL                                   │
 * │                                                                         │
 * │  This adapter is a correctly-typed stub for a future Gilbarco           │
 * │  Commander / Verifone Ruby2 live integration.                           │
 * │                                                                         │
 * │  WHY IT IS A STUB:                                                      │
 * │  Direct POS write APIs for Commander / Ruby2 are not publicly           │
 * │  documented and require site-specific vendor agreements.  Pretending    │
 * │  they work would be dishonest and potentially dangerous.                │
 * │                                                                         │
 * │  WHAT TO DO IF YOU NEED LIVE INTEGRATION:                               │
 * │  1. Obtain the official Commander SDK / NAXML spec from Gilbarco.       │
 * │  2. Implement each TODO below using only documented, tested calls.      │
 * │  3. Keep readOnly: true until validateChanges() confirms safety.        │
 * │  4. Never remove the backup-before-write requirement.                   │
 * │                                                                         │
 * │  In the meantime every call safely returns a "not supported" result     │
 * │  so the UI can show a clear capability warning instead of a fake        │
 * │  success response.                                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

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

export class CommanderAdapter implements IPosAdapter {
  readonly adapterType: AdapterType = 'commander';

  readonly capabilities: AdapterCapabilities = {
    adapterType:         'commander',
    canConnect:          false, // TODO: implement once SDK docs obtained
    canReadItems:        false, // TODO
    canReadSales:        false, // TODO
    canWriteItems:       false, // TODO – requires vendor agreement
    canWritePrices:      false, // TODO – requires vendor agreement
    canBackup:           false, // TODO
    supportsRealTime:    false,
    supportedFormats:    ['xml_plu', 'csv_pricebook', 'csv_transactions'],
    writeRequiresLogout: true,
    disclaimer:
      'The Commander / Ruby2 live adapter is not yet implemented. ' +
      'Use File Import mode to load XML or CSV exports from your POS ' +
      'back-office software.  Live write-back will be added once the ' +
      'relevant vendor APIs are documented and verified.',
  };

  private _config: ConnectionConfig | null = null;

  configure(config: ConnectionConfig): void {
    this._config = config;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return {
      success:   false,
      message:
        'Commander live connection is not yet implemented. ' +
        'Switch to "File Import" mode or use the Mock adapter for a demo.',
    };
  }

  async connect(): Promise<ConnectionTestResult> {
    return this.testConnection();
  }

  async backup(_options: BackupOptions): Promise<BackupResult> {
    // TODO: implement once Commander backup API is documented
    return {
      success:  false,
      filePath: '',
      message:  'Backup via live Commander connection is not yet supported.',
    };
  }

  async importFile(_options: ImportFileOptions): Promise<ImportResult> {
    // TODO: implement file import via Commander ODBC or file-share path
    return {
      jobId:          '',
      format:         _options.format,
      recordsTotal:   0,
      recordsOk:      0,
      recordsSkipped: 0,
      recordsError:   0,
      errors:         [{ message: 'Commander live import is not yet implemented.' }],
      dryRun:         _options.dryRun ?? false,
    };
  }

  async validateChanges(_changeSet: ChangeSet): Promise<ValidationResult> {
    return {
      valid:        false,
      warnings:     [],
      errors:       [{ code: 'NOT_IMPLEMENTED', message: 'Commander write-back is not yet implemented.', severity: 'error' }],
      dryRunReport: 'Not implemented.',
    };
  }

  async applyChanges(_changeSet: ChangeSet, _backupConfirmId: string): Promise<ApplyResult> {
    return {
      success:           false,
      appliedCount:      0,
      failedCount:       _changeSet.changes.length,
      rollbackAvailable: false,
      message:
        'Commander live write-back is not yet implemented. ' +
        'Export approved changes to a file and import them manually in the POS.',
    };
  }

  getCapabilities(): AdapterCapabilities {
    return this.capabilities;
  }

  async disconnect(): Promise<void> {
    // nothing to close
  }
}
