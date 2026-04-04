/**
 * ItemAuditService
 *
 * Analyzes the PLU item catalog for data quality issues and generates
 * human-reviewable recommendations. Rules are based on common c-store
 * merchandising standards (consistent naming, correct tax flags,
 * age-restriction flags, department classification, UPC cleanliness, etc.).
 *
 * No recommendations are applied automatically – all require explicit
 * owner/manager approval through the UI.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';

// ─── Rule codes ───────────────────────────────────────────────────────────────
export const RULE_CODES = {
  BLANK_DESC:          'BLANK_DESC',
  BLANK_SHORT_DESC:    'BLANK_SHORT_DESC',
  DUPLICATE_UPC:       'DUPLICATE_UPC',
  DUPLICATE_DESC:      'DUPLICATE_DESC',
  MISSING_UPC:         'MISSING_UPC',
  MISSING_DEPT:        'MISSING_DEPT',
  MISSING_CATEGORY:    'MISSING_CATEGORY',
  INCONSISTENT_UOM:    'INCONSISTENT_UOM',
  WRONG_TAX_TOBACCO:   'WRONG_TAX_TOBACCO',
  WRONG_AGE_TOBACCO:   'WRONG_AGE_TOBACCO',
  WRONG_AGE_ALCOHOL:   'WRONG_AGE_ALCOHOL',
  WRONG_DEPT_ENERGY:   'WRONG_DEPT_ENERGY',
  BAD_UPC_LENGTH:      'BAD_UPC_LENGTH',
  ABBREV_TOO_LONG:     'ABBREV_TOO_LONG',
  NO_COST:             'NO_COST',
  NO_PRICE:            'NO_PRICE',
  PRICE_BELOW_COST:    'PRICE_BELOW_COST',
  INCONSISTENT_PACK:   'INCONSISTENT_PACK',
} as const;

export type RuleCode = typeof RULE_CODES[keyof typeof RULE_CODES];

export interface ItemRecommendation {
  pluItemId: string;
  posPluId: string;
  description: string;
  fieldName: string;
  currentValue: string | null;
  recommendedValue: string | null;
  reason: string;
  ruleCode: RuleCode;
  confidence: number;
  requiresManualReview: boolean;
}

export interface AuditRunResult {
  jobRunId: string;
  totalItems: number;
  totalRecommendations: number;
  recommendations: ItemRecommendation[];
  ruleBreakdown: Record<string, number>;
}

export class ItemAuditService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  async runAudit(storeId: string, userId: string): Promise<AuditRunResult> {
    const jobRunId = uuidv4();
    const now = new Date().toISOString();

    this.audit.log({
      storeId,
      userId,
      eventType: 'audit',
      eventSubtype: 'item_audit_started',
      description: `Item audit run ${jobRunId} started`,
    });

    const items = this.db.all<ItemRow>(
      `SELECT p.*, d.name as dept_name, d.tax_flag as dept_tax_flag,
              d.age_restricted as dept_age_restricted, d.is_fuel as dept_is_fuel,
              c.name as cat_name,
              (SELECT GROUP_CONCAT(sc.barcode,'|') FROM scan_codes sc WHERE sc.plu_item_id=p.id) as barcodes
       FROM plu_items p
       LEFT JOIN departments d ON d.id = p.department_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id=? AND p.is_active=1`,
      [storeId]
    );

    // Build lookup structures for cross-item checks
    const descMap = new Map<string, string[]>();
    const upcMap  = new Map<string, string[]>();

    for (const item of items) {
      const desc = (item.description ?? '').toUpperCase().trim();
      if (desc) {
        if (!descMap.has(desc)) descMap.set(desc, []);
        descMap.get(desc)!.push(item.id);
      }
      const codes = (item.barcodes ?? '').split('|').filter(Boolean);
      for (const code of codes) {
        if (!upcMap.has(code)) upcMap.set(code, []);
        upcMap.get(code)!.push(item.id);
      }
    }

    const recommendations: ItemRecommendation[] = [];

    for (const item of items) {
      recommendations.push(...this.auditItem(item, descMap, upcMap));
    }

    // Persist recommendations
    if (recommendations.length > 0) {
      this.db.transaction(() => {
        for (const rec of recommendations) {
          this.db.run(
            `INSERT INTO item_recommendations(id,store_id,plu_item_id,job_run_id,field_name,
             current_value,recommended_value,reason,rule_code,confidence,requires_manual_review,status,created_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [uuidv4(), storeId, rec.pluItemId, jobRunId, rec.fieldName,
             rec.currentValue, rec.recommendedValue, rec.reason, rec.ruleCode,
             rec.confidence, rec.requiresManualReview ? 1 : 0, 'pending', now]
          );
        }
      });
    }

    const ruleBreakdown: Record<string, number> = {};
    for (const rec of recommendations) {
      ruleBreakdown[rec.ruleCode] = (ruleBreakdown[rec.ruleCode] ?? 0) + 1;
    }

    this.audit.log({
      storeId,
      userId,
      eventType: 'audit',
      eventSubtype: 'item_audit_completed',
      description: `Item audit run ${jobRunId} completed. ${recommendations.length} recommendations on ${items.length} items.`,
    });

    return {
      jobRunId,
      totalItems: items.length,
      totalRecommendations: recommendations.length,
      recommendations,
      ruleBreakdown,
    };
  }

  // ─── Per-item analysis ────────────────────────────────────────────────────

  private auditItem(
    item: ItemRow,
    descMap: Map<string, string[]>,
    upcMap:  Map<string, string[]>
  ): ItemRecommendation[] {
    const recs: ItemRecommendation[] = [];
    const add = (r: Omit<ItemRecommendation, 'pluItemId' | 'posPluId' | 'description'>) =>
      recs.push({ pluItemId: item.id, posPluId: item.pos_plu_id, description: item.description ?? '', ...r });

    // ── Blank description ─────────────────────────────────────────────────
    if (!item.description?.trim()) {
      add({ fieldName: 'description', currentValue: item.description ?? '',
            recommendedValue: null, reason: 'Item has no description. A clear name is required for reports and receipts.',
            ruleCode: 'BLANK_DESC', confidence: 1.0, requiresManualReview: true });
    }

    // ── Blank short description ───────────────────────────────────────────
    if (item.description?.trim() && !item.description_short?.trim()) {
      const suggested = this.suggestShortDesc(item.description);
      add({ fieldName: 'description_short', currentValue: item.description_short ?? '',
            recommendedValue: suggested,
            reason: 'Short description (receipt abbreviation) is blank. POS receipt may show PLU number instead.',
            ruleCode: 'BLANK_SHORT_DESC', confidence: 0.85, requiresManualReview: false });
    }

    // ── Short description too long (>12 chars typical for receipt) ────────
    if ((item.description_short?.length ?? 0) > 12) {
      add({ fieldName: 'description_short', currentValue: item.description_short ?? '',
            recommendedValue: (item.description_short ?? '').substring(0, 12),
            reason: 'Short description exceeds 12 characters, which may be truncated on receipt printers.',
            ruleCode: 'ABBREV_TOO_LONG', confidence: 0.75, requiresManualReview: false });
    }

    // ── Missing department ────────────────────────────────────────────────
    if (!item.department_id) {
      add({ fieldName: 'department_id', currentValue: null, recommendedValue: null,
            reason: 'Item is not assigned to any department. Sales reporting will be incomplete.',
            ruleCode: 'MISSING_DEPT', confidence: 1.0, requiresManualReview: true });
    }

    // ── Missing category ──────────────────────────────────────────────────
    if (!item.category_id) {
      add({ fieldName: 'category_id', currentValue: null, recommendedValue: null,
            reason: 'Item has no category assignment. Category-level reports will be inaccurate.',
            ruleCode: 'MISSING_CATEGORY', confidence: 0.9, requiresManualReview: true });
    }

    // ── Missing UPC ───────────────────────────────────────────────────────
    if (!item.barcodes) {
      add({ fieldName: 'scan_code', currentValue: null, recommendedValue: null,
            reason: 'Item has no scan codes / barcodes. Cashiers cannot scan this item at POS.',
            ruleCode: 'MISSING_UPC', confidence: 0.95, requiresManualReview: true });
    }

    // ── Duplicate UPC ─────────────────────────────────────────────────────
    if (item.barcodes) {
      for (const code of item.barcodes.split('|').filter(Boolean)) {
        const duplicates = (upcMap.get(code) ?? []).filter(id => id !== item.id);
        if (duplicates.length > 0) {
          add({ fieldName: 'scan_code', currentValue: code, recommendedValue: null,
                reason: `Barcode ${code} is assigned to multiple PLU items (${duplicates.length + 1} total). The POS will ring the wrong item.`,
                ruleCode: 'DUPLICATE_UPC', confidence: 1.0, requiresManualReview: true });
          break;
        }
      }
    }

    // ── Bad UPC length ────────────────────────────────────────────────────
    if (item.barcodes) {
      for (const code of item.barcodes.split('|').filter(Boolean)) {
        if (!/^\d+$/.test(code)) continue;
        if (![8, 12, 13, 14].includes(code.length)) {
          add({ fieldName: 'scan_code', currentValue: code, recommendedValue: null,
                reason: `Barcode "${code}" has ${code.length} digits. Standard barcodes are 8 (UPC-E), 12 (UPC-A), 13 (EAN-13), or 14 (GTIN-14) digits.`,
                ruleCode: 'BAD_UPC_LENGTH', confidence: 0.9, requiresManualReview: true });
        }
      }
    }

    // ── Duplicate description ─────────────────────────────────────────────
    const desc = (item.description ?? '').toUpperCase().trim();
    if (desc) {
      const dupes = (descMap.get(desc) ?? []).filter(id => id !== item.id);
      if (dupes.length > 0) {
        add({ fieldName: 'description', currentValue: item.description, recommendedValue: null,
              reason: `Description "${item.description}" is used by ${dupes.length + 1} PLU items. Duplicate names cause confusion in reports.`,
              ruleCode: 'DUPLICATE_DESC', confidence: 0.9, requiresManualReview: true });
      }
    }

    // ── Tobacco department rules ───────────────────────────────────────────
    const isTobaccoDept = (item.dept_name ?? '').match(/tobacco|cigaret|cigar|smokeless|vape|ecig/i);
    if (isTobaccoDept) {
      if (!item.tax_flag) {
        add({ fieldName: 'tax_flag', currentValue: '0', recommendedValue: '1',
              reason: 'Tobacco items should typically be taxable. Verify this is correct for your jurisdiction.',
              ruleCode: 'WRONG_TAX_TOBACCO', confidence: 0.85, requiresManualReview: true });
      }
      if (!item.age_restricted) {
        add({ fieldName: 'age_restricted', currentValue: '0', recommendedValue: '1',
              reason: 'Tobacco/nicotine items require age verification. This flag must be set to comply with regulations.',
              ruleCode: 'WRONG_AGE_TOBACCO', confidence: 0.98, requiresManualReview: false });
      }
    }

    // ── Alcohol department rules ───────────────────────────────────────────
    const isAlcoholDept = (item.dept_name ?? '').match(/beer|wine|liquor|alcohol|spirit/i);
    if (isAlcoholDept && !item.age_restricted) {
      add({ fieldName: 'age_restricted', currentValue: '0', recommendedValue: '1',
            reason: 'Alcohol items require age verification. This flag must be set to comply with regulations.',
            ruleCode: 'WRONG_AGE_ALCOHOL', confidence: 0.98, requiresManualReview: false });
    }

    // ── Misclassified energy drinks ───────────────────────────────────────
    const isEnergyDesc = (item.description ?? '').match(/red bull|monster|rockstar|bang|celsius|reign|nv |nos |full throttle/i);
    const isGroceryDept = (item.dept_name ?? '').match(/grocer|general|misc/i);
    if (isEnergyDesc && isGroceryDept) {
      add({ fieldName: 'department_id', currentValue: item.dept_name ?? null,
            recommendedValue: 'PACKAGED BEV or ENERGY DRINKS dept',
            reason: 'Energy drink appears to be in a generic grocery department. Consider moving to a Packaged Beverages or Energy Drinks department for accurate category reporting.',
            ruleCode: 'WRONG_DEPT_ENERGY', confidence: 0.80, requiresManualReview: true });
    }

    // ── Inconsistent unit of measure ─────────────────────────────────────
    if (item.unit_descriptor && item.unit_descriptor !== item.unit_descriptor.toUpperCase()) {
      add({ fieldName: 'unit_descriptor', currentValue: item.unit_descriptor,
            recommendedValue: item.unit_descriptor.toUpperCase(),
            reason: 'Unit of measure should be uppercase for consistency (e.g., "EA" not "ea").',
            ruleCode: 'INCONSISTENT_UOM', confidence: 0.95, requiresManualReview: false });
    }

    // ── Missing cost ──────────────────────────────────────────────────────
    if (item.cost === null || item.cost === undefined) {
      add({ fieldName: 'cost', currentValue: null, recommendedValue: null,
            reason: 'Item has no cost on file. Margin calculations and pricing recommendations will be unavailable.',
            ruleCode: 'NO_COST', confidence: 0.9, requiresManualReview: true });
    }

    // ── Missing retail price ──────────────────────────────────────────────
    if (!item.retail_price) {
      add({ fieldName: 'retail_price', currentValue: null, recommendedValue: null,
            reason: 'Item has no retail price. It cannot be sold or appear in pricing reports.',
            ruleCode: 'NO_PRICE', confidence: 1.0, requiresManualReview: true });
    }

    // ── Price below cost ──────────────────────────────────────────────────
    if (item.cost && item.retail_price && item.retail_price < item.cost && !item.dept_is_fuel) {
      add({ fieldName: 'retail_price', currentValue: String(item.retail_price),
            recommendedValue: String(item.cost * 1.2),
            reason: `Retail price ($${item.retail_price?.toFixed(2)}) is below cost ($${item.cost?.toFixed(2)}). This item is selling at a loss.`,
            ruleCode: 'PRICE_BELOW_COST', confidence: 0.99, requiresManualReview: true });
    }

    return recs;
  }

  // ─── Get pending recommendations ─────────────────────────────────────────

  getPendingRecommendations(storeId: string, jobRunId?: string): unknown[] {
    const sql = jobRunId
      ? `SELECT r.*, p.pos_plu_id, p.description, p.department_id, d.name as dept_name
         FROM item_recommendations r
         JOIN plu_items p ON p.id = r.plu_item_id
         LEFT JOIN departments d ON d.id = p.department_id
         WHERE r.store_id=? AND r.job_run_id=? AND r.status='pending'
         ORDER BY r.confidence DESC, r.created_at ASC`
      : `SELECT r.*, p.pos_plu_id, p.description, p.department_id, d.name as dept_name
         FROM item_recommendations r
         JOIN plu_items p ON p.id = r.plu_item_id
         LEFT JOIN departments d ON d.id = p.department_id
         WHERE r.store_id=? AND r.status='pending'
         ORDER BY r.confidence DESC, r.created_at ASC`;

    return this.db.all(sql, jobRunId ? [storeId, jobRunId] : [storeId]);
  }

  approveRecommendation(recId: string, userId: string, notes?: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE item_recommendations SET status='approved', reviewed_by=?, reviewed_at=?, review_notes=? WHERE id=?`,
      [userId, now, notes ?? null, recId]
    );
  }

  rejectRecommendation(recId: string, userId: string, notes?: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE item_recommendations SET status='rejected', reviewed_by=?, reviewed_at=?, review_notes=? WHERE id=?`,
      [userId, now, notes ?? null, recId]
    );
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private suggestShortDesc(description: string): string {
    return description.substring(0, 12).trim().toUpperCase();
  }
}

// Internal type for queried rows
interface ItemRow {
  id: string;
  pos_plu_id: string;
  description: string | null;
  description_short: string | null;
  department_id: string | null;
  category_id: string | null;
  tax_flag: number;
  age_restricted: number;
  foodstamp_eligible: number;
  is_fuel: number;
  unit_descriptor: string | null;
  pack_size: number;
  cost: number | null;
  retail_price: number | null;
  dept_name: string | null;
  dept_tax_flag: number;
  dept_age_restricted: number;
  dept_is_fuel: number;
  cat_name: string | null;
  barcodes: string | null;
}
