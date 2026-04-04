/**
 * OpenCStore Back Office – POS Integration Adapter Interface
 *
 * IMPORTANT NOTES FOR INTEGRATORS:
 * ─────────────────────────────────────────────────────────────
 * 1. This interface is ADAPTER-ONLY. It does not represent any official
 *    Verifone or Gilbarco API. All integrations are custom implementations
 *    built on publicly observable file formats or site-specific agreements.
 *
 * 2. Read-only mode must always be available. Write operations require
 *    explicit user approval, dry-run validation, and backup confirmation
 *    before anything is sent to the POS.
 *
 * 3. If a live POS write API is unavailable, adapters must implement
 *    export-file workflows and return AdapterCapabilities.canWrite = false.
 *
 * 4. Never attempt a write without first calling backup() and validateChanges().
 * ─────────────────────────────────────────────────────────────
 */

// ─── Connection ──────────────────────────────────────────────────────────────

export interface ConnectionConfig {
  adapterType: AdapterType;
  host?: string;
  port?: number;
  dbName?: string;
  /** Username hint for display only. Actual credentials resolved by caller via OS keychain. */
  usernameHint?: string;
  useSsl?: boolean;
  /** When true, all write operations are blocked at the adapter level. */
  readOnly: boolean;
  /** Arbitrary extra settings for site-specific adapters. */
  extras?: Record<string, unknown>;
}

export type AdapterType =
  | 'verifone_ruby2'
  | 'commander'
  | 'mock'
  | 'file_import'
  | 'generic_odbc';

export interface AdapterCapabilities {
  canConnect: boolean;
  canRead: boolean;
  canWrite: boolean;
  canBackup: boolean;
  supportsRealTime: boolean;
  supportedImportFormats: ImportFormat[];
  supportedExportFormats: ExportFormat[];
  notes: string[];
}

export type ImportFormat = 'xml_plu' | 'csv_pricebook' | 'csv_transactions' | 'csv_departments' | 'api_json';
export type ExportFormat = 'xml_plu' | 'csv_pricebook' | 'json';

export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  serverVersion?: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Import / Export ─────────────────────────────────────────────────────────

export interface ImportOptions {
  format: ImportFormat;
  filePath?: string;
  /** If true, parse only – do not persist to DB. Returns raw records. */
  dryRun?: boolean;
  /** Max records to import per call (pagination / safety). */
  limit?: number;
  offset?: number;
}

export interface ImportResult {
  jobId: string;
  format: ImportFormat;
  recordsTotal: number;
  recordsOk: number;
  recordsSkipped: number;
  recordsError: number;
  errors: ImportError[];
  dryRun: boolean;
}

export interface ImportError {
  row?: number;
  field?: string;
  message: string;
  rawData?: unknown;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupOptions {
  backupType: 'full' | 'plu' | 'pricebook' | 'transactions';
  destinationDir: string;
}

export interface BackupResult {
  success: boolean;
  filePath: string;
  fileSizeBytes?: number;
  checksum?: string;
  message: string;
}

// ─── Change Management ────────────────────────────────────────────────────────

export interface ChangeSet {
  batchId: string;
  changeType: 'plu_update' | 'price_update' | 'department_update';
  changes: ChangeRecord[];
}

export interface ChangeRecord {
  entityType: string;
  entityId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  approvedById: string;
  approvedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationMessage[];
  errors: ValidationMessage[];
  dryRunReport: string;
}

export interface ValidationMessage {
  code: string;
  field?: string;
  entityId?: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}

export interface ApplyResult {
  success: boolean;
  appliedCount: number;
  failedCount: number;
  exportFilePath?: string;
  posMessage?: string;
  rollbackAvailable: boolean;
  message: string;
}

// ─── POS Data Types ──────────────────────────────────────────────────────────

export interface RawDepartment {
  pos_dept_id: string;
  name: string;
  tax_flag: boolean;
  age_restricted: boolean;
  is_fuel: boolean;
  raw: Record<string, unknown>;
}

export interface RawCategory {
  pos_category_id: string;
  pos_dept_id: string;
  name: string;
  raw: Record<string, unknown>;
}

export interface RawPluItem {
  pos_plu_id: string;
  description: string;
  description_short?: string;
  department_id?: string;
  category_id?: string;
  tax_flag: boolean;
  age_restricted: boolean;
  foodstamp_eligible: boolean;
  unit_descriptor?: string;
  pack_size?: number;
  cost?: number;
  retail_price?: number;
  scan_codes: RawScanCode[];
  vendor_code?: string;
  product_code?: string;
  raw: Record<string, unknown>;
}

export interface RawScanCode {
  barcode: string;
  barcode_type: string;
  is_primary: boolean;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface IPosAdapter {
  readonly adapterType: AdapterType;
  readonly capabilities: AdapterCapabilities;

  /** Initialize with connection config. Does NOT connect yet. */
  configure(config: ConnectionConfig): void;

  /** Attempt connection. Safe to call repeatedly. */
  connect(): Promise<ConnectionTestResult>;

  /** Non-destructive ping. */
  testConnection(): Promise<ConnectionTestResult>;

  /** Create a snapshot backup before any read/write session. */
  backup(options: BackupOptions): Promise<BackupResult>;

  /** Read all data in the given format. */
  exportData(options: ImportOptions): Promise<{
    departments?: RawDepartment[];
    categories?: RawCategory[];
    items?: RawPluItem[];
    raw?: unknown;
  }>;

  /** Parse a local file (XML, CSV) without POS connectivity. */
  parseFile(filePath: string, format: ImportFormat): Promise<{
    departments?: RawDepartment[];
    categories?: RawCategory[];
    items?: RawPluItem[];
    raw?: unknown;
  }>;

  /** Dry-run a changeset. Returns structured warnings/errors. */
  validateChanges(changeSet: ChangeSet): Promise<ValidationResult>;

  /**
   * Apply approved changes. Will refuse unless:
   *  1. readOnly === false in config
   *  2. validateChanges returned valid === true
   *  3. backup has been confirmed
   *
   * Returns an export file path when direct POS write is unavailable
   * so the operator can import manually.
   */
  applyChanges(changeSet: ChangeSet, backupConfirmId: string): Promise<ApplyResult>;

  /**
   * Notify that POS logout/login may be needed after changes.
   * Returns a human-readable message to display to the user.
   */
  logoutNotice(): string;

  disconnect(): Promise<void>;
}
