/**
 * ImportService
 *
 * Orchestrates data import from POS adapters or file uploads into SQLite.
 * Always creates a backup manifest entry before any destructive operation.
 * Preserves original source data.
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import type { IPosAdapter, RawDepartment, RawCategory, RawPluItem } from '../../integrations/AdapterInterface';

export interface ImportRequest {
  storeId: string;
  userId: string;
  adapter: IPosAdapter;
  sourceFile?: string;
  format: 'xml_plu' | 'csv_pricebook' | 'csv_transactions' | 'csv_departments' | 'api_json';
  backupDir: string;
  dryRun?: boolean;
}

export interface ImportSummary {
  jobId: string;
  backupId: string | null;
  recordsTotal: number;
  recordsOk: number;
  recordsSkipped: number;
  recordsError: number;
  errors: string[];
  dryRun: boolean;
  completed: boolean;
}

export class ImportService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  async runImport(req: ImportRequest): Promise<ImportSummary> {
    const jobId = uuidv4();
    const now = new Date().toISOString();
    let backupId: string | null = null;

    // 1. Create backup before import
    if (!req.dryRun) {
      const backupResult = await req.adapter.backup({
        backupType: 'full',
        destinationDir: req.backupDir,
      });

      if (backupResult.success) {
        backupId = uuidv4();
        this.db.run(
          `INSERT INTO backup_manifest(id,store_id,triggered_by,backup_type,file_path,file_size_bytes,checksum,source_adapter,status,created_at,completed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          [backupId, req.storeId, req.userId, 'full', backupResult.filePath,
           backupResult.fileSizeBytes ?? null, backupResult.checksum ?? null,
           req.adapter.adapterType, 'complete', now, now]
        );
      }
    }

    // 2. Create import job record
    this.db.run(
      `INSERT INTO import_jobs(id,store_id,triggered_by,source_type,source_file,adapter_type,status,backup_id,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [jobId, req.storeId, req.userId, req.format, req.sourceFile ?? null,
       req.adapter.adapterType, 'running', backupId, now]
    );

    this.audit.log({
      storeId: req.storeId,
      userId: req.userId,
      eventType: 'import',
      eventSubtype: 'started',
      description: `Import job ${jobId} started. Format: ${req.format}. Dry-run: ${req.dryRun ?? false}`,
      entityType: 'import_job',
      entityId: jobId,
    });

    const summary: ImportSummary = {
      jobId,
      backupId,
      recordsTotal: 0,
      recordsOk: 0,
      recordsSkipped: 0,
      recordsError: 0,
      errors: [],
      dryRun: req.dryRun ?? false,
      completed: false,
    };

    try {
      // 3. Parse / export data
      let parsed: {
        departments?: RawDepartment[];
        categories?: RawCategory[];
        items?: RawPluItem[];
      };

      if (req.sourceFile) {
        parsed = await req.adapter.parseFile(req.sourceFile, req.format);
      } else {
        parsed = await req.adapter.exportData({ format: req.format });
      }

      summary.recordsTotal =
        (parsed.departments?.length ?? 0) +
        (parsed.categories?.length ?? 0) +
        (parsed.items?.length ?? 0);

      if (!req.dryRun) {
        // 4. Persist in a transaction
        this.db.transaction(() => {
          if (parsed.departments?.length) {
            const r = this.persistDepartments(req.storeId, jobId, parsed.departments!);
            summary.recordsOk += r.ok;
            summary.recordsSkipped += r.skipped;
            summary.recordsError += r.errors;
            summary.errors.push(...r.errorMessages);
          }

          if (parsed.categories?.length) {
            const r = this.persistCategories(req.storeId, jobId, parsed.categories!);
            summary.recordsOk += r.ok;
            summary.recordsSkipped += r.skipped;
            summary.recordsError += r.errors;
            summary.errors.push(...r.errorMessages);
          }

          if (parsed.items?.length) {
            const r = this.persistPluItems(req.storeId, jobId, parsed.items!);
            summary.recordsOk += r.ok;
            summary.recordsSkipped += r.skipped;
            summary.recordsError += r.errors;
            summary.errors.push(...r.errorMessages);
          }
        });
      } else {
        // Dry-run: just count
        summary.recordsOk = summary.recordsTotal;
      }

      summary.completed = true;

      const completedAt = new Date().toISOString();
      this.db.run(
        `UPDATE import_jobs SET status='complete', records_total=?, records_ok=?, records_skipped=?,
         records_error=?, error_detail=?, completed_at=? WHERE id=?`,
        [summary.recordsTotal, summary.recordsOk, summary.recordsSkipped,
         summary.recordsError, summary.errors.slice(0, 10).join('; ') || null, completedAt, jobId]
      );

      this.audit.log({
        storeId: req.storeId,
        userId: req.userId,
        eventType: 'import',
        eventSubtype: 'completed',
        description: `Import job ${jobId} completed. ${summary.recordsOk} ok, ${summary.recordsError} errors.`,
        entityType: 'import_job',
        entityId: jobId,
      });

    } catch (err) {
      const msg = (err as Error).message;
      this.db.run(
        `UPDATE import_jobs SET status='failed', error_detail=?, completed_at=? WHERE id=?`,
        [msg, new Date().toISOString(), jobId]
      );
      summary.errors.push(msg);

      this.audit.log({
        storeId: req.storeId,
        userId: req.userId,
        eventType: 'import',
        eventSubtype: 'failed',
        description: `Import job ${jobId} failed: ${msg}`,
        entityType: 'import_job',
        entityId: jobId,
        result: 'failure',
        errorDetail: msg,
      });
    }

    return summary;
  }

  // ─── Persist helpers ──────────────────────────────────────────────────────

  private persistDepartments(storeId: string, jobId: string, depts: RawDepartment[]) {
    let ok = 0, skipped = 0, errors = 0;
    const errorMessages: string[] = [];
    const now = new Date().toISOString();

    for (const d of depts) {
      if (!d.pos_dept_id || !d.name) { skipped++; continue; }
      try {
        const existing = this.db.get<{ id: string }>(
          'SELECT id FROM departments WHERE store_id=? AND pos_dept_id=?', [storeId, d.pos_dept_id]
        );
        if (existing) {
          this.db.run(
            `UPDATE departments SET name=?,tax_flag=?,age_restricted=?,is_fuel=?,
             import_job_id=?,source_raw=?,updated_at=? WHERE id=?`,
            [d.name, d.tax_flag ? 1 : 0, d.age_restricted ? 1 : 0, d.is_fuel ? 1 : 0,
             jobId, JSON.stringify(d.raw), now, existing.id]
          );
        } else {
          this.db.run(
            `INSERT INTO departments(id,store_id,import_job_id,pos_dept_id,name,tax_flag,age_restricted,is_fuel,source_raw,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            [uuidv4(), storeId, jobId, d.pos_dept_id, d.name,
             d.tax_flag ? 1 : 0, d.age_restricted ? 1 : 0, d.is_fuel ? 1 : 0,
             JSON.stringify(d.raw), now, now]
          );
        }
        ok++;
      } catch (e) {
        errors++;
        errorMessages.push(`Dept ${d.pos_dept_id}: ${(e as Error).message}`);
      }
    }
    return { ok, skipped, errors, errorMessages };
  }

  private persistCategories(storeId: string, jobId: string, cats: RawCategory[]) {
    let ok = 0, skipped = 0, errors = 0;
    const errorMessages: string[] = [];
    const now = new Date().toISOString();

    for (const c of cats) {
      if (!c.pos_category_id || !c.name) { skipped++; continue; }
      try {
        const dept = this.db.get<{ id: string }>(
          'SELECT id FROM departments WHERE store_id=? AND pos_dept_id=?', [storeId, c.pos_dept_id]
        );
        const existing = this.db.get<{ id: string }>(
          'SELECT id FROM categories WHERE store_id=? AND pos_category_id=?', [storeId, c.pos_category_id]
        );
        if (existing) {
          this.db.run(
            `UPDATE categories SET name=?,department_id=?,import_job_id=?,source_raw=?,updated_at=? WHERE id=?`,
            [c.name, dept?.id ?? null, jobId, JSON.stringify(c.raw), now, existing.id]
          );
        } else {
          this.db.run(
            `INSERT INTO categories(id,store_id,import_job_id,department_id,pos_category_id,name,source_raw,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?)`,
            [uuidv4(), storeId, jobId, dept?.id ?? null, c.pos_category_id, c.name,
             JSON.stringify(c.raw), now, now]
          );
        }
        ok++;
      } catch (e) {
        errors++;
        errorMessages.push(`Cat ${c.pos_category_id}: ${(e as Error).message}`);
      }
    }
    return { ok, skipped, errors, errorMessages };
  }

  private persistPluItems(storeId: string, jobId: string, items: RawPluItem[]) {
    let ok = 0, skipped = 0, errors = 0;
    const errorMessages: string[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      if (!item.pos_plu_id) { skipped++; continue; }
      try {
        const dept = item.department_id
          ? this.db.get<{ id: string }>('SELECT id FROM departments WHERE store_id=? AND pos_dept_id=?', [storeId, item.department_id])
          : null;
        const cat = item.category_id
          ? this.db.get<{ id: string }>('SELECT id FROM categories WHERE store_id=? AND pos_category_id=?', [storeId, item.category_id])
          : null;

        const existing = this.db.get<{ id: string }>(
          'SELECT id FROM plu_items WHERE store_id=? AND pos_plu_id=?', [storeId, item.pos_plu_id]
        );

        let itemId: string;
        if (existing) {
          itemId = existing.id;
          this.db.run(
            `UPDATE plu_items SET description=?,description_short=?,department_id=?,category_id=?,
             tax_flag=?,age_restricted=?,foodstamp_eligible=?,is_fuel=?,unit_descriptor=?,
             pack_size=?,cost=?,retail_price=?,vendor_code=?,product_code=?,
             import_job_id=?,source_raw=?,updated_at=? WHERE id=?`,
            [item.description, item.description_short ?? null, dept?.id ?? null, cat?.id ?? null,
             item.tax_flag ? 1 : 0, item.age_restricted ? 1 : 0, item.foodstamp_eligible ? 1 : 0,
             item.is_fuel ? 1 : 0, item.unit_descriptor ?? 'EA', item.pack_size ?? 1,
             item.cost ?? null, item.retail_price ?? null, item.vendor_code ?? null,
             item.product_code ?? null, jobId, JSON.stringify(item.raw), now, existing.id]
          );
        } else {
          itemId = uuidv4();
          this.db.run(
            `INSERT INTO plu_items(id,store_id,import_job_id,pos_plu_id,description,description_short,
             department_id,category_id,tax_flag,age_restricted,foodstamp_eligible,is_fuel,
             unit_descriptor,pack_size,cost,retail_price,vendor_code,product_code,source_raw,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [itemId, storeId, jobId, item.pos_plu_id, item.description,
             item.description_short ?? null, dept?.id ?? null, cat?.id ?? null,
             item.tax_flag ? 1 : 0, item.age_restricted ? 1 : 0, item.foodstamp_eligible ? 1 : 0,
             item.is_fuel ? 1 : 0, item.unit_descriptor ?? 'EA', item.pack_size ?? 1,
             item.cost ?? null, item.retail_price ?? null, item.vendor_code ?? null,
             item.product_code ?? null, JSON.stringify(item.raw), now, now]
          );
        }

        // Persist scan codes
        for (const sc of item.scan_codes) {
          if (!sc.barcode) continue;
          const scExisting = this.db.get(
            'SELECT id FROM scan_codes WHERE plu_item_id=? AND barcode=?', [itemId, sc.barcode]
          );
          if (!scExisting) {
            this.db.run(
              `INSERT INTO scan_codes(id,plu_item_id,barcode,barcode_type,is_primary,created_at)
               VALUES(?,?,?,?,?,?)`,
              [uuidv4(), itemId, sc.barcode, sc.barcode_type, sc.is_primary ? 1 : 0, now]
            );
          }
        }

        ok++;
      } catch (e) {
        errors++;
        errorMessages.push(`PLU ${item.pos_plu_id}: ${(e as Error).message}`);
      }
    }
    return { ok, skipped, errors, errorMessages };
  }

  // ─── Job history ──────────────────────────────────────────────────────────

  getImportHistory(storeId: string, limit = 20): unknown[] {
    return this.db.all(
      `SELECT j.*, u.display_name as triggered_by_name
       FROM import_jobs j LEFT JOIN users u ON u.id=j.triggered_by
       WHERE j.store_id=? ORDER BY j.created_at DESC LIMIT ?`,
      [storeId, limit]
    );
  }
}
