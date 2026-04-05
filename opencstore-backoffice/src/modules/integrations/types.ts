/**
 * src/modules/integrations/types.ts
 *
 * Shared types and contracts for every POS adapter.
 * No vendor-specific logic lives here – only the interface and data shapes
 * that all adapters must satisfy.
 */

// ─── Adapter identity ────────────────────────────────────────────────────────

export type AdapterType =
  | 'mock_commander'   // built-in demo adapter
  | 'file_import'      // XML / CSV file-based import only
  | 'commander'        // Gilbarco Commander – PLACEHOLDER, see commander.adapter.ts
  | 'verifone_ruby2';  // Verifone Ruby2  – PLACEHOLDER, future adapter

// ─── Capabilities ────────────────────────────────────────────────────────────

export interface AdapterCapabilities {
  adapterType:          AdapterType;
  canConnect:           boolean;
  canReadItems:         boolean;
  canReadSales:         boolean;
  canWriteItems:        boolean;  // true only when a verified write API exists
  canWritePrices:       boolean;
  canBackup:            boolean;
  supportsRealTime:     boolean;
  supportedFormats:     ImportFormat[];
  writeRequiresLogout:  boolean;  // POS must be logged out before changes apply
  disclaimer:           string;   // mandatory disclosure shown in UI
}

export type ImportFormat =
  | 'xml_plu'
  | 'csv_pricebook'
  | 'csv_transactions'
  | 'csv_departments'
  | 'json_export';

// ─── Connection ───────────────────────────────────────────────────────────────

export interface ConnectionConfig {
  adapterType:   AdapterType;
  /** IP / hostname – never hardcoded; collected from user at onboarding */
  host?:         string;
  port?:         number;
  database?:     string;
  /** Hint label only – no plaintext password stored here */
  usernameHint?: string;
  useSsl?:       boolean;
  /** When true the adapter will refuse all write operations */
  readOnly:      boolean;
  extras?:       Record<string, unknown>;
}

export interface ConnectionTestResult {
  success:       boolean;
  latencyMs?:    number;
  serverVersion?: string;
  message:       string;
  details?:      Record<string, unknown>;
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export interface ImportFileOptions {
  format:   ImportFormat;
  filePath: string;
  dryRun?:  boolean;
}

export interface ImportResult {
  jobId:          string;
  format:         ImportFormat;
  recordsTotal:   number;
  recordsOk:      number;
  recordsSkipped: number;
  recordsError:   number;
  errors:         ImportError[];
  dryRun:         boolean;
  backupId?:      string;
}

export interface ImportError {
  row?:     number;
  field?:   string;
  message:  string;
  rawData?: unknown;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupOptions {
  backupType:     'full' | 'plu' | 'pricebook' | 'transactions';
  destinationDir: string;
}

export interface BackupResult {
  success:       boolean;
  filePath:      string;
  fileSizeBytes?: number;
  checksum?:     string;
  message:       string;
}

// ─── Change management ────────────────────────────────────────────────────────

export interface ChangeSet {
  batchId:    string;
  changeType: 'plu_update' | 'price_update' | 'department_update';
  changes:    ChangeRecord[];
}

export interface ChangeRecord {
  entityType:   string;
  entityId:     string;
  field:        string;
  oldValue:     unknown;
  newValue:     unknown;
  reason:       string;
  approvedById: string;
  approvedAt:   string;
}

export interface ValidationResult {
  valid:         boolean;
  warnings:      ValidationMessage[];
  errors:        ValidationMessage[];
  dryRunReport:  string;
}

export interface ValidationMessage {
  code:      string;
  field?:    string;
  entityId?: string;
  message:   string;
  severity:  'info' | 'warning' | 'error';
}

export interface ApplyResult {
  success:           boolean;
  appliedCount:      number;
  failedCount:       number;
  exportFilePath?:   string;
  rollbackAvailable: boolean;
  message:           string;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface IPosAdapter {
  readonly adapterType: AdapterType;
  readonly capabilities: AdapterCapabilities;

  configure(config: ConnectionConfig): void;

  /** Non-destructive ping */
  testConnection(): Promise<ConnectionTestResult>;

  /** Open the connection (idempotent) */
  connect(): Promise<ConnectionTestResult>;

  /** Create a snapshot before any read/write session */
  backup(options: BackupOptions): Promise<BackupResult>;

  /** Export data from a live POS or parse a local file */
  importFile(options: ImportFileOptions): Promise<ImportResult>;

  /** Dry-run a changeset and return structured feedback */
  validateChanges(changeSet: ChangeSet): Promise<ValidationResult>;

  /**
   * Apply an approved changeset.
   * MUST refuse if:
   *   – readOnly === true in config
   *   – validateChanges() was not run first
   *   – backupConfirmId is missing
   *
   * Where live write-back is unsupported, returns an export file path.
   */
  applyChanges(changeSet: ChangeSet, backupConfirmId: string): Promise<ApplyResult>;

  /** Return the human-readable logout notice for this POS type */
  getCapabilities(): AdapterCapabilities;

  disconnect(): Promise<void>;
}
