/**
 * ReportService
 *
 * Generates and archives reports. Every report run is saved to reports_archive
 * for historical lookup.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';

export type ReportType =
  | 'daily_shift'
  | 'eod_close'
  | 'sales_by_dept'
  | 'sales_by_category'
  | 'sales_by_item'
  | 'fuel_summary'
  | 'tender_summary'
  | 'tax_summary'
  | 'voids_refunds'
  | 'cashier_performance'
  | 'margin_report'
  | 'price_change_history'
  | 'item_compliance'
  | 'over_short';

export interface ReportParams {
  storeId: string;
  userId: string;
  reportType: ReportType;
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string;
  shiftId?: string;
  cashierId?: string;
  departmentId?: string;
  categoryId?: string;
}

export class ReportService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  generate(params: ReportParams): { id: string; data: unknown } {
    const { storeId, userId, reportType, startDate, endDate } = params;
    const start = startDate + 'T00:00:00';
    const end   = endDate   + 'T23:59:59';
    let data: unknown;

    switch (reportType) {
      case 'sales_by_dept':       data = this.salesByDept(storeId, start, end); break;
      case 'sales_by_category':   data = this.salesByCategory(storeId, start, end); break;
      case 'sales_by_item':       data = this.salesByItem(storeId, start, end, params.categoryId); break;
      case 'tender_summary':      data = this.tenderSummary(storeId, start, end); break;
      case 'tax_summary':         data = this.taxSummary(storeId, start, end); break;
      case 'voids_refunds':       data = this.voidsRefunds(storeId, start, end); break;
      case 'cashier_performance': data = this.cashierPerformance(storeId, start, end); break;
      case 'margin_report':       data = this.marginReport(storeId); break;
      case 'price_change_history':data = this.priceChangeHistory(storeId, start, end); break;
      case 'item_compliance':     data = this.itemCompliance(storeId); break;
      case 'over_short':          data = this.overShort(storeId, start, end); break;
      case 'daily_shift':
      case 'eod_close':
      default:                    data = this.dailySummary(storeId, start, end); break;
    }

    // Archive
    const reportId = uuidv4();
    this.db.run(
      `INSERT INTO reports_archive(id,store_id,report_type,report_period_start,report_period_end,
       generated_by,parameters,data_snapshot,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [reportId, storeId, reportType, startDate, endDate, userId,
       JSON.stringify(params), JSON.stringify(data), new Date().toISOString()]
    );

    this.audit.log({
      storeId,
      userId,
      eventType: 'report',
      eventSubtype: reportType,
      description: `Report "${reportType}" generated for ${startDate} – ${endDate}.`,
      entityId: reportId,
    });

    return { id: reportId, data };
  }

  // ─── Report generators ────────────────────────────────────────────────────

  private dailySummary(storeId: string, start: string, end: string) {
    const totals = this.db.get(
      `SELECT
         COUNT(DISTINCT id)                                AS txn_count,
         COALESCE(SUM(CASE WHEN txn_type='sale'   THEN total END),0) AS gross_sales,
         COALESCE(SUM(CASE WHEN txn_type='void'   THEN total END),0) AS total_voids,
         COALESCE(SUM(CASE WHEN txn_type='refund' THEN total END),0) AS total_refunds,
         COALESCE(SUM(tax_total),0)                        AS total_tax,
         COALESCE(SUM(discount_total),0)                   AS total_discounts
       FROM transactions
       WHERE store_id=? AND txn_at BETWEEN ? AND ? AND is_training=0`,
      [storeId, start, end]
    );
    const depts  = this.salesByDept(storeId, start, end);
    const tender = this.tenderSummary(storeId, start, end);
    return { period: { start, end }, totals, departments: depts, tenders: tender };
  }

  private salesByDept(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT d.name as department, d.pos_dept_id,
              COUNT(DISTINCT t.id)  AS txn_count,
              COALESCE(SUM(ti.quantity),0)   AS units_sold,
              COALESCE(SUM(ti.ext_price),0)  AS gross_sales,
              COALESCE(SUM(ti.discount_amount),0) AS discounts,
              COALESCE(SUM(ti.ext_price - COALESCE(p.cost*ti.quantity,0)),0) AS gross_margin_dollars
       FROM transaction_items ti
       JOIN transactions t ON t.id=ti.transaction_id
       LEFT JOIN plu_items p ON p.id=ti.plu_item_id
       LEFT JOIN departments d ON d.id=p.department_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at BETWEEN ? AND ? AND t.is_training=0
       GROUP BY d.id ORDER BY gross_sales DESC`,
      [storeId, start, end]
    );
  }

  private salesByCategory(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT c.name as category, d.name as department,
              COALESCE(SUM(ti.quantity),0)  AS units_sold,
              COALESCE(SUM(ti.ext_price),0) AS gross_sales
       FROM transaction_items ti
       JOIN transactions t ON t.id=ti.transaction_id
       LEFT JOIN plu_items p ON p.id=ti.plu_item_id
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN departments d ON d.id=p.department_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at BETWEEN ? AND ? AND t.is_training=0
       GROUP BY c.id ORDER BY gross_sales DESC`,
      [storeId, start, end]
    );
  }

  private salesByItem(storeId: string, start: string, end: string, categoryId?: string) {
    const catFilter = categoryId ? 'AND p.category_id=?' : '';
    const args: unknown[] = [storeId, start, end];
    if (categoryId) args.push(categoryId);
    return this.db.all(
      `SELECT p.pos_plu_id, p.description, d.name as department, c.name as category,
              COALESCE(SUM(ti.quantity),0)  AS units_sold,
              COALESCE(SUM(ti.ext_price),0) AS gross_sales,
              p.retail_price, p.cost,
              CASE WHEN p.retail_price > 0 AND p.cost IS NOT NULL
                   THEN ROUND((p.retail_price - p.cost)/p.retail_price*100,1) END AS margin_pct
       FROM transaction_items ti
       JOIN transactions t ON t.id=ti.transaction_id
       LEFT JOIN plu_items p ON p.id=ti.plu_item_id
       LEFT JOIN departments d ON d.id=p.department_id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at BETWEEN ? AND ? AND t.is_training=0
       ${catFilter}
       GROUP BY p.id ORDER BY gross_sales DESC LIMIT 500`,
      args
    );
  }

  private tenderSummary(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT te.tender_type, COUNT(*) AS count, COALESCE(SUM(te.amount),0) AS total_amount,
              COALESCE(SUM(te.change_given),0) AS change_given
       FROM tenders te
       JOIN transactions t ON t.id=te.transaction_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at BETWEEN ? AND ? AND t.is_training=0
       GROUP BY te.tender_type ORDER BY total_amount DESC`,
      [storeId, start, end]
    );
  }

  private taxSummary(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT d.name as department,
              COALESCE(SUM(ti.tax_amount),0) AS total_tax,
              COALESCE(SUM(ti.ext_price),0)  AS taxable_sales
       FROM transaction_items ti
       JOIN transactions t ON t.id=ti.transaction_id
       JOIN plu_items p ON p.id=ti.plu_item_id
       JOIN departments d ON d.id=p.department_id
       WHERE t.store_id=? AND t.txn_type='sale' AND t.txn_at BETWEEN ? AND ?
         AND p.tax_flag=1 AND t.is_training=0
       GROUP BY d.id ORDER BY total_tax DESC`,
      [storeId, start, end]
    );
  }

  private voidsRefunds(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT t.txn_type, t.txn_at, t.total, c.name as cashier_name, t.pos_txn_id
       FROM transactions t
       LEFT JOIN pos_cashiers c ON c.id=t.cashier_id
       WHERE t.store_id=? AND t.txn_type IN ('void','refund') AND t.txn_at BETWEEN ? AND ?
       ORDER BY t.txn_at DESC`,
      [storeId, start, end]
    );
  }

  private cashierPerformance(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT c.name as cashier_name, c.pos_cashier_id,
              COUNT(CASE WHEN t.txn_type='sale'   THEN 1 END) AS sale_count,
              COUNT(CASE WHEN t.txn_type='void'   THEN 1 END) AS void_count,
              COUNT(CASE WHEN t.txn_type='refund' THEN 1 END) AS refund_count,
              COALESCE(SUM(CASE WHEN t.txn_type='sale' THEN t.total END),0)    AS total_sales,
              COALESCE(SUM(CASE WHEN t.txn_type='void' THEN t.total END),0)    AS total_voids,
              COALESCE(SUM(t.discount_total),0) AS total_discounts
       FROM transactions t
       LEFT JOIN pos_cashiers c ON c.id=t.cashier_id
       WHERE t.store_id=? AND t.txn_at BETWEEN ? AND ? AND t.is_training=0
       GROUP BY t.cashier_id ORDER BY total_sales DESC`,
      [storeId, start, end]
    );
  }

  private marginReport(storeId: string) {
    return this.db.all(
      `SELECT p.pos_plu_id, p.description, d.name as department, c.name as category,
              p.cost, p.retail_price,
              CASE WHEN p.retail_price > 0
                   THEN ROUND((p.retail_price - COALESCE(p.cost,0)) / p.retail_price * 100, 1)
                   ELSE NULL END AS margin_pct,
              p.retail_price - COALESCE(p.cost,0) AS margin_dollars
       FROM plu_items p
       LEFT JOIN departments d ON d.id=p.department_id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE p.store_id=? AND p.is_active=1 AND p.retail_price IS NOT NULL
       ORDER BY margin_pct ASC NULLS LAST`,
      [storeId]
    );
  }

  private priceChangeHistory(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT h.*, p.pos_plu_id, p.description, u.display_name as changed_by_name
       FROM price_change_history h
       JOIN plu_items p ON p.id=h.plu_item_id
       LEFT JOIN users u ON u.id=h.changed_by
       WHERE h.store_id=? AND h.created_at BETWEEN ? AND ?
       ORDER BY h.created_at DESC`,
      [storeId, start, end]
    );
  }

  private itemCompliance(storeId: string) {
    const counts = this.db.get<{ total: number; missing_desc: number; missing_upc: number; missing_dept: number; dup_upc: number }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN description='' OR description IS NULL THEN 1 ELSE 0 END) AS missing_desc,
         SUM(CASE WHEN (SELECT COUNT(*) FROM scan_codes sc WHERE sc.plu_item_id=p.id)=0 THEN 1 ELSE 0 END) AS missing_upc,
         SUM(CASE WHEN department_id IS NULL THEN 1 ELSE 0 END) AS missing_dept,
         0 AS dup_upc
       FROM plu_items p WHERE store_id=? AND is_active=1`,
      [storeId]
    );
    const recommendations = this.db.all(
      `SELECT rule_code, COUNT(*) as cnt FROM item_recommendations
       WHERE store_id=? AND status='pending' GROUP BY rule_code ORDER BY cnt DESC`,
      [storeId]
    );
    return { counts, recommendations };
  }

  private overShort(storeId: string, start: string, end: string) {
    return this.db.all(
      `SELECT s.shift_number, s.opened_at, s.closed_at, c.name as cashier_name,
              s.opening_cash, s.closing_cash, s.expected_cash, s.over_short
       FROM shifts s LEFT JOIN pos_cashiers c ON c.id=s.cashier_id
       WHERE s.store_id=? AND s.opened_at BETWEEN ? AND ?
       ORDER BY s.opened_at DESC`,
      [storeId, start, end]
    );
  }

  // ─── Retrieve archived reports ─────────────────────────────────────────────

  getArchive(storeId: string, limit = 50): unknown[] {
    return this.db.all(
      `SELECT id, report_type, report_period_start, report_period_end, generated_by, created_at
       FROM reports_archive WHERE store_id=? ORDER BY created_at DESC LIMIT ?`,
      [storeId, limit]
    );
  }

  getArchivedReport(reportId: string): unknown | undefined {
    return this.db.get(`SELECT * FROM reports_archive WHERE id=?`, [reportId]);
  }
}
