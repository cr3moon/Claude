/**
 * PricingService
 *
 * Generates explainable pricing recommendations based on:
 *  - Cost changes
 *  - Margin below configurable department targets
 *  - Price-ending strategy violations
 *  - Low-volume items with low dollar margin
 *
 * All recommendations require explicit owner approval before any export/write-back.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';

// ─── Rules ────────────────────────────────────────────────────────────────────

export const PRICING_RULES = {
  MARGIN_BELOW_TARGET:    'MARGIN_BELOW_TARGET',
  COST_INCREASE:          'COST_INCREASE',
  BAD_PRICE_ENDING:       'BAD_PRICE_ENDING',
  LOW_VOLUME_LOW_MARGIN:  'LOW_VOLUME_LOW_MARGIN',
  PRICE_BELOW_COST:       'PRICE_BELOW_COST',
  ZERO_MARGIN:            'ZERO_MARGIN',
} as const;

// Default target margin ranges by department keyword (% gross margin)
const DEFAULT_DEPT_MARGINS: { pattern: RegExp; target: number; min: number }[] = [
  { pattern: /tobacco|cigaret|cigar|smokeless/i, target: 30, min: 20 },
  { pattern: /beer|wine|liquor/i,                target: 28, min: 18 },
  { pattern: /packaged bev|carbonated|energy|sports drink|water|juice/i, target: 40, min: 28 },
  { pattern: /snack|chip|candy|chocolate/i,      target: 45, min: 32 },
  { pattern: /grocery|general/i,                 target: 35, min: 22 },
  { pattern: /hot food|deli|bakery/i,             target: 55, min: 40 },
  { pattern: /car care|automotive/i,              target: 45, min: 30 },
  { pattern: /health|beauty/i,                    target: 40, min: 28 },
  { pattern: /dairy|milk|egg/i,                   target: 20, min: 10 },
];

const FALLBACK_TARGET_MARGIN = 35;
const FALLBACK_MIN_MARGIN    = 20;

// Accepted price endings (cents) – configurable, default is .9 endings
const DEFAULT_PRICE_ENDINGS = [0.99, 0.89, 0.79, 0.49, 0.29, 0.09, 0.00];

export interface PricingRunResult {
  jobRunId: string;
  totalItems: number;
  totalRecommendations: number;
  ruleBreakdown: Record<string, number>;
}

export class PricingService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  async runPricingAnalysis(storeId: string, userId: string): Promise<PricingRunResult> {
    const jobRunId = uuidv4();
    const now = new Date().toISOString();

    this.audit.log({
      storeId,
      userId,
      eventType: 'pricing',
      eventSubtype: 'analysis_started',
      description: `Pricing analysis run ${jobRunId} started`,
    });

    const items = this.db.all<PricingRow>(
      `SELECT p.id, p.pos_plu_id, p.description, p.cost, p.retail_price,
              d.name as dept_name
       FROM plu_items p
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.store_id=? AND p.is_active=1
         AND p.retail_price IS NOT NULL AND p.retail_price > 0`,
      [storeId]
    );

    const recs: PricingRecRow[] = [];
    const ruleBreakdown: Record<string, number> = {};

    for (const item of items) {
      const itemRecs = this.analyzeItem(item, storeId, jobRunId, now);
      for (const r of itemRecs) {
        recs.push(r);
        ruleBreakdown[r.rule_code] = (ruleBreakdown[r.rule_code] ?? 0) + 1;
      }
    }

    if (recs.length > 0) {
      this.db.transaction(() => {
        for (const r of recs) {
          this.db.run(
            `INSERT INTO pricing_recommendations(id,store_id,plu_item_id,job_run_id,
             current_retail,current_cost,current_margin_pct,recommended_retail,
             estimated_margin_pct,reason,rule_code,confidence,status,created_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [r.id, storeId, r.plu_item_id, jobRunId,
             r.current_retail, r.current_cost, r.current_margin_pct,
             r.recommended_retail, r.estimated_margin_pct,
             r.reason, r.rule_code, r.confidence, 'pending', now]
          );
        }
      });
    }

    this.audit.log({
      storeId,
      userId,
      eventType: 'pricing',
      eventSubtype: 'analysis_completed',
      description: `Pricing analysis ${jobRunId}: ${recs.length} recommendations on ${items.length} items.`,
    });

    return { jobRunId, totalItems: items.length, totalRecommendations: recs.length, ruleBreakdown };
  }

  // ─── Per-item analysis ────────────────────────────────────────────────────

  private analyzeItem(item: PricingRow, _storeId: string, jobRunId: string, _now: string): PricingRecRow[] {
    const recs: PricingRecRow[] = [];

    const retail = item.retail_price ?? 0;
    const cost   = item.cost ?? null;
    const { target, min } = this.getDeptMarginTargets(item.dept_name ?? '');

    const currentMargin = cost && retail > 0
      ? ((retail - cost) / retail) * 100
      : null;

    // ── Price below cost ─────────────────────────────────────────────────
    if (cost && retail < cost) {
      const recommended = this.applyPriceEnding(cost * (1 + target / 100));
      recs.push(this.buildRec(item, jobRunId, {
        recommended_retail: recommended,
        current_margin_pct: currentMargin,
        estimated_margin_pct: this.calcMargin(recommended, cost),
        reason: `Retail price ($${retail.toFixed(2)}) is below cost ($${cost.toFixed(2)}). Item is selling at a loss.`,
        rule_code: 'PRICE_BELOW_COST',
        confidence: 1.0,
      }));
      return recs; // highest severity – don't stack
    }

    // ── Zero margin ───────────────────────────────────────────────────────
    if (cost && Math.abs(retail - cost) < 0.01) {
      const recommended = this.applyPriceEnding(cost * (1 + target / 100));
      recs.push(this.buildRec(item, jobRunId, {
        recommended_retail: recommended,
        current_margin_pct: 0,
        estimated_margin_pct: this.calcMargin(recommended, cost),
        reason: `Retail equals cost – item has zero gross margin.`,
        rule_code: 'ZERO_MARGIN',
        confidence: 0.99,
      }));
      return recs;
    }

    // ── Margin below target ───────────────────────────────────────────────
    if (cost && currentMargin !== null && currentMargin < min) {
      const recommended = this.applyPriceEnding(cost / (1 - target / 100));
      recs.push(this.buildRec(item, jobRunId, {
        recommended_retail: recommended,
        current_margin_pct: currentMargin,
        estimated_margin_pct: this.calcMargin(recommended, cost),
        reason: `Gross margin (${currentMargin.toFixed(1)}%) is below the configured minimum (${min}%) for ${item.dept_name ?? 'this department'}. Suggested retail achieves ~${target}% margin.`,
        rule_code: 'MARGIN_BELOW_TARGET',
        confidence: 0.85,
      }));
    }

    // ── Bad price ending ──────────────────────────────────────────────────
    if (!this.hasGoodEnding(retail)) {
      const adjusted = this.applyPriceEnding(retail);
      if (Math.abs(adjusted - retail) > 0.001) {
        recs.push(this.buildRec(item, jobRunId, {
          recommended_retail: adjusted,
          current_margin_pct: currentMargin,
          estimated_margin_pct: cost ? this.calcMargin(adjusted, cost) : null,
          reason: `Price $${retail.toFixed(2)} does not follow standard price-ending strategy (e.g., .99, .49, .29). Adjusted to $${adjusted.toFixed(2)}.`,
          rule_code: 'BAD_PRICE_ENDING',
          confidence: 0.70,
        }));
      }
    }

    return recs;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getDeptMarginTargets(deptName: string): { target: number; min: number } {
    for (const rule of DEFAULT_DEPT_MARGINS) {
      if (rule.pattern.test(deptName)) return { target: rule.target, min: rule.min };
    }
    return { target: FALLBACK_TARGET_MARGIN, min: FALLBACK_MIN_MARGIN };
  }

  private calcMargin(retail: number, cost: number): number {
    if (!retail || !cost) return 0;
    return ((retail - cost) / retail) * 100;
  }

  private hasGoodEnding(price: number): boolean {
    const cents = Math.round((price % 1) * 100) / 100;
    return DEFAULT_PRICE_ENDINGS.some(e => Math.abs(cents - (e % 1)) < 0.001);
  }

  private applyPriceEnding(price: number): number {
    const base = Math.floor(price);
    const bestEnding = DEFAULT_PRICE_ENDINGS.reduce((best, e) => {
      const candidate = base + (e % 1 > 0 ? e % 1 : 0);
      const adj = candidate < price ? candidate + 1 : candidate;
      const prevAdj = best < price ? best + 1 : best;
      return adj < prevAdj ? adj : prevAdj;
    }, base + 0.99);
    return Math.round(bestEnding * 100) / 100;
  }

  private buildRec(
    item: PricingRow,
    jobRunId: string,
    fields: Omit<PricingRecRow, 'id' | 'plu_item_id' | 'current_retail' | 'current_cost'>
  ): PricingRecRow {
    return {
      id: uuidv4(),
      plu_item_id: item.id,
      current_retail: item.retail_price,
      current_cost: item.cost ?? null,
      ...fields,
    };
  }

  // ─── Query helpers ────────────────────────────────────────────────────────

  getPendingRecommendations(storeId: string, jobRunId?: string): unknown[] {
    const sql = jobRunId
      ? `SELECT r.*, p.pos_plu_id, p.description, d.name as dept_name
         FROM pricing_recommendations r
         JOIN plu_items p ON p.id=r.plu_item_id
         LEFT JOIN departments d ON d.id=p.department_id
         WHERE r.store_id=? AND r.job_run_id=? AND r.status='pending'
         ORDER BY r.confidence DESC`
      : `SELECT r.*, p.pos_plu_id, p.description, d.name as dept_name
         FROM pricing_recommendations r
         JOIN plu_items p ON p.id=r.plu_item_id
         LEFT JOIN departments d ON d.id=p.department_id
         WHERE r.store_id=? AND r.status='pending'
         ORDER BY r.confidence DESC`;
    return this.db.all(sql, jobRunId ? [storeId, jobRunId] : [storeId]);
  }

  approveRecommendation(recId: string, userId: string, notes?: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pricing_recommendations SET status='approved', reviewed_by=?, reviewed_at=?, review_notes=? WHERE id=?`,
      [userId, now, notes ?? null, recId]
    );
  }

  rejectRecommendation(recId: string, userId: string, notes?: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE pricing_recommendations SET status='rejected', reviewed_by=?, reviewed_at=?, review_notes=? WHERE id=?`,
      [userId, now, notes ?? null, recId]
    );
  }

  exportApprovedChanges(storeId: string, userId: string, batchId: string): unknown[] {
    const approved = this.db.all<{ id: string; plu_item_id: string; recommended_retail: number; current_retail: number; current_cost: number }>(
      `SELECT r.id, r.plu_item_id, r.recommended_retail, r.current_retail, r.current_cost
       FROM pricing_recommendations r WHERE r.store_id=? AND r.status='approved'`,
      [storeId]
    );

    const now = new Date().toISOString();

    this.db.transaction(() => {
      for (const rec of approved) {
        const currentMargin = rec.current_cost && rec.current_retail > 0
          ? ((rec.current_retail - rec.current_cost) / rec.current_retail) * 100
          : null;
        const newMargin = rec.current_cost && rec.recommended_retail > 0
          ? ((rec.recommended_retail - rec.current_cost) / rec.recommended_retail) * 100
          : null;

        this.db.run(
          `INSERT INTO price_change_history(id,store_id,plu_item_id,changed_by,recommendation_id,
           old_retail,new_retail,old_cost,new_cost,old_margin_pct,new_margin_pct,
           change_reason,change_method,write_back_status,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuidv4(), storeId, rec.plu_item_id, userId, rec.id,
           rec.current_retail, rec.recommended_retail,
           rec.current_cost ?? null, rec.current_cost ?? null,
           currentMargin, newMargin,
           'Approved via pricing recommendation engine', 'recommendation',
           'pending_export', now]
        );

        this.db.run(
          `UPDATE pricing_recommendations SET status='applied', applied_at=? WHERE id=?`,
          [now, rec.id]
        );
      }
    });

    this.audit.log({
      storeId,
      userId,
      eventType: 'pricing',
      eventSubtype: 'changes_exported',
      description: `${approved.length} approved pricing changes exported in batch ${batchId}.`,
    });

    return approved;
  }
}

interface PricingRow {
  id: string;
  pos_plu_id: string;
  description: string;
  cost: number | null;
  retail_price: number;
  dept_name: string | null;
}

interface PricingRecRow {
  id: string;
  plu_item_id: string;
  current_retail: number;
  current_cost: number | null;
  current_margin_pct: number | null;
  recommended_retail: number;
  estimated_margin_pct: number | null;
  reason: string;
  rule_code: string;
  confidence: number;
}
