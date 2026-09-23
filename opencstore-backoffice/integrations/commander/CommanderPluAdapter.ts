/**
 * CommanderPluAdapter
 *
 * Wraps an already-connected CommanderNaxmlClient as an IPosAdapter, so a
 * live catalog pull from Commander (`vPLUs`) flows through the exact same
 * ImportService pipeline (backup → parse → persist) as Mock Import and
 * File Import — see docs/commander-ruby-reports.md and plu-parser.ts for
 * why this is flagged unverified against this store's own unit.
 *
 * Read-only by design: `capabilities.canWrite` is false and
 * validateChanges/applyChanges both refuse. Commander does have a write
 * command (`uPLUs`) per the same sibling reference this adapter's read
 * path is sourced from, but wiring a live price/description push carries
 * the same "don't push blind" risk already called out for
 * ufuelprices/cfuelprices in CommanderNaxmlClient — out of scope here.
 *
 * This adapter is constructed around a *live, already-authenticated*
 * client (the same instance used for fuel prices) rather than owning its
 * own connection — configure()/connect() are therefore no-ops.
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import {
  IPosAdapter,
  AdapterType,
  AdapterCapabilities,
  ConnectionConfig,
  ConnectionTestResult,
  BackupOptions,
  BackupResult,
  ImportOptions,
  ImportFormat,
  ChangeSet,
  ValidationResult,
  ApplyResult,
  RawDepartment,
  RawPluItem,
} from '../AdapterInterface';
import type { CommanderNaxmlClient, CommanderPluRecord } from './CommanderNaxmlClient';

export class CommanderPluAdapter implements IPosAdapter {
  readonly adapterType: AdapterType = 'commander';

  readonly capabilities: AdapterCapabilities = {
    canConnect: true,
    canRead: true,
    canWrite: false, // read-only — see class doc
    canBackup: true,
    supportsRealTime: true,
    supportedImportFormats: ['xml_plu'],
    supportedExportFormats: [],
    notes: [
      'Live pull from a connected Verifone Commander unit (vPLUs) — not derived from any Verifone SDK.',
      'Read-only: no price or description write-back from this adapter.',
      'Item-level tax/age-restriction flags are not available from this live feed — verify via Item Audit after syncing.',
      'Second-hand protocol reference; unverified against this store\'s own unit until confirmed (docs/commander-ruby-reports.md).',
    ],
  };

  constructor(private client: CommanderNaxmlClient) {}

  configure(_config: ConnectionConfig): void {
    // No-op: this adapter wraps an already-configured, already-connected client.
  }

  async connect(): Promise<ConnectionTestResult> {
    return this.testConnection();
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const result = await this.client.testConnection();
    return { success: result.success, latencyMs: result.latencyMs, message: result.message };
  }

  async backup(options: BackupOptions): Promise<BackupResult> {
    try {
      const catalog = await this.client.getFullPluCatalog();
      const fileName = `commander_plu_backup_${Date.now()}.json`;
      const filePath = path.join(options.destinationDir, fileName);
      if (!fs.existsSync(options.destinationDir)) fs.mkdirSync(options.destinationDir, { recursive: true });

      const payload = { source: 'commander_vPLUs', createdAt: new Date().toISOString(), itemCount: catalog.length, items: catalog };
      fs.writeFileSync(filePath, JSON.stringify(payload));

      return {
        success: true,
        filePath,
        fileSizeBytes: Buffer.byteLength(JSON.stringify(payload)),
        message: `Backed up ${catalog.length} live PLU record(s) from Commander.`,
      };
    } catch (err) {
      return { success: false, filePath: '', message: `Commander PLU backup failed: ${(err as Error).message}` };
    }
  }

  async exportData(_options: ImportOptions): Promise<{ departments?: RawDepartment[]; items?: RawPluItem[]; raw?: unknown }> {
    const catalog = await this.client.getFullPluCatalog();
    const departmentNames = await this.tryResolveDepartmentNames();

    const seenDeptSysids = new Set<string>();
    const departments: RawDepartment[] = [];
    for (const item of catalog) {
      if (!item.departmentSysid || seenDeptSysids.has(item.departmentSysid)) continue;
      seenDeptSysids.add(item.departmentSysid);
      departments.push({
        pos_dept_id: item.departmentSysid,
        name: departmentNames.get(item.departmentSysid) ?? `DEPT ${item.departmentSysid}`,
        // Not derivable from vPLUs — see class/adapter doc. Left false rather
        // than guessed; Item Audit is the place to catch a wrong default.
        tax_flag: false,
        age_restricted: false,
        is_fuel: false,
        raw: {},
      });
    }

    const items: RawPluItem[] = catalog.map((p) => this.toRawPluItem(p));

    return { departments, items, raw: catalog };
  }

  async parseFile(_filePath: string, _format: ImportFormat): Promise<{ departments?: RawDepartment[]; items?: RawPluItem[] }> {
    throw new Error('CommanderPluAdapter is a live-connection adapter and does not parse local files — use File Import for that.');
  }

  async validateChanges(_changeSet: ChangeSet): Promise<ValidationResult> {
    return {
      valid: false,
      warnings: [],
      errors: [{ code: 'READ_ONLY_ADAPTER', message: 'CommanderPluAdapter is read-only; it does not support writing changes back.', severity: 'error' }],
      dryRunReport: 'Not supported: this adapter is read-only.',
    };
  }

  async applyChanges(_changeSet: ChangeSet, _backupConfirmId: string): Promise<ApplyResult> {
    return {
      success: false,
      appliedCount: 0,
      failedCount: _changeSet.changes.length,
      rollbackAvailable: false,
      message: 'CommanderPluAdapter is read-only; it does not write changes back to Commander or export a change file.',
    };
  }

  logoutNotice(): string {
    return 'This was a live, read-only pull from Commander — no POS logout/login is needed.';
  }

  async disconnect(): Promise<void> {
    // No-op: this adapter does not own the client's connection lifecycle.
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toRawPluItem(p: CommanderPluRecord): RawPluItem {
    return {
      pos_plu_id: `${p.upc}:${p.upcModifier}`,
      description: p.description,
      department_id: p.departmentSysid || undefined,
      tax_flag: p.hasTaxRates,
      age_restricted: false,   // not derivable from vPLUs — see class doc
      foodstamp_eligible: false, // not derivable from vPLUs — see class doc
      unit_descriptor: 'EA',
      pack_size: p.sellUnit || 1,
      retail_price: p.price,
      scan_codes: p.upc ? [{ barcode: p.upc, barcode_type: 'UPC_A', is_primary: true }] : [],
      raw: p as unknown as Record<string, unknown>,
    };
  }

  /**
   * Best-effort: resolve department sysid -> display name via the Ruby
   * department report's `vs:deptBase sysid` attribute (the same sysid
   * `vPLUs`' `department` field carries). Never throws — a department
   * whose sysid isn't found here just keeps its "DEPT {sysid}" fallback
   * name in exportData() above; this report may not exist for `current`
   * on every unit (e.g. before any sales have posted that day).
   */
  private async tryResolveDepartmentNames(): Promise<Map<string, string>> {
    try {
      const report = await this.client.getRubyReport('department', 'current', '2');
      const map = new Map<string, string>();
      for (const d of report.departments) {
        if (d.sysid) map.set(d.sysid, d.name);
      }
      return map;
    } catch {
      return new Map();
    }
  }
}
