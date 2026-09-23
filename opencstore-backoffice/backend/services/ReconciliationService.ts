/**
 * ReconciliationService
 *
 * Captures Commander Ruby period reports (see CommanderNaxmlClient's
 * getReportPeriods/getRubyReport, backed by ruby-report-parser.ts) into
 * commander_report_snapshots/commander_department_report_lines, and
 * compares them against the manually-entered figures this app already
 * relies on (manual_sales_entries, shift_checklists.over_short_amount) —
 * see docs/commander-ruby-reports.md for why this is flagged unverified
 * against a real unit until confirmed.
 *
 * This is additive: manual daily sales entry and shift-close checklists
 * remain the primary data path. Capturing a Commander snapshot for a date
 * just gives a second source to compare that manual entry against.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import type { CommanderNaxmlClient } from '../../integrations/commander/CommanderNaxmlClient';
import { buildVarianceRows, findPeriodsForDate, type VarianceRow } from '../../src/modules/reconciliation/reconciliation-rules';

export interface CommanderSnapshotRow {
  id: string;
  period_type: 1 | 2;
  report_date: string;
  period_filename: string;
  period_value: string;
  fuel_sales: number;
  outside_sales_delta: number | null;
  high_tax_taxable: number;
  high_tax_net: number;
  low_tax_taxable: number;
  low_tax_net: number;
  cash_tender: number;
  credit_tender: number;
  debit_tender: number;
  created_at: string;
  updated_at: string;
}

export interface DailyReconciliation {
  hasCommanderData: boolean;
  dailySnapshot: CommanderSnapshotRow | null;
  departmentVariance: VarianceRow[];
  shiftSnapshots: CommanderSnapshotRow[];
}

export class ReconciliationService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  /**
   * Pulls and stores the DAILY Ruby report (summary + tax + department
   * breakdown) for `dateIso`, matching a closed Commander period to that
   * date (or the still-open `current` period when `dateIso` is today).
   * Returns null if no matching Commander period exists yet.
   */
  async captureDailyReport(
    client: CommanderNaxmlClient,
    storeId: string,
    userId: string,
    dateIso: string,
    todayIso: string
  ): Promise<CommanderSnapshotRow | null> {
    const periods = await client.getReportPeriods();
    const [period] = findPeriodsForDate(periods, 2, dateIso, todayIso);
    if (!period) return null;

    const [summary, tax, department] = await Promise.all([
      client.getRubyReport('summary', period.filename, period.period),
      client.getRubyReport('tax', period.filename, period.period),
      client.getRubyReport('department', period.filename, period.period),
    ]);

    const snapshotId = this.upsertSnapshot(storeId, userId, dateIso, period, summary, tax);

    this.db.run('DELETE FROM commander_department_report_lines WHERE snapshot_id=?', [snapshotId]);
    for (const line of department.departments) {
      this.db.run(
        `INSERT INTO commander_department_report_lines(id, snapshot_id, department_name, net_sales) VALUES(?,?,?,?)`,
        [uuidv4(), snapshotId, line.name, line.netSales]
      );
    }

    this.audit.log({
      storeId, userId, eventType: 'commander', eventSubtype: 'daily_report_captured',
      description: `Captured Commander daily report for ${dateIso} (period ${period.filename}).`,
    });

    return this.getSnapshot(snapshotId)!;
  }

  /**
   * Pulls and stores every closed SHIFT report covering `dateIso` (summary
   * + tax only — no department breakdown at shift granularity). Returns
   * the captured snapshots, in period order.
   */
  async captureShiftReports(
    client: CommanderNaxmlClient,
    storeId: string,
    userId: string,
    dateIso: string,
    todayIso: string
  ): Promise<CommanderSnapshotRow[]> {
    const periods = await client.getReportPeriods();
    const shiftPeriods = findPeriodsForDate(periods, 1, dateIso, todayIso);
    const out: CommanderSnapshotRow[] = [];

    for (const period of shiftPeriods) {
      const [summary, tax] = await Promise.all([
        client.getRubyReport('summary', period.filename, period.period),
        client.getRubyReport('tax', period.filename, period.period),
      ]);
      const snapshotId = this.upsertSnapshot(storeId, userId, dateIso, period, summary, tax);
      out.push(this.getSnapshot(snapshotId)!);
    }

    if (shiftPeriods.length > 0) {
      this.audit.log({
        storeId, userId, eventType: 'commander', eventSubtype: 'shift_reports_captured',
        description: `Captured ${shiftPeriods.length} Commander shift report(s) for ${dateIso}.`,
      });
    }

    return out;
  }

  private upsertSnapshot(
    storeId: string,
    userId: string,
    dateIso: string,
    period: { periodType: 1 | 2; filename: string; period: string },
    summary: { fuelSales: number; outsideSalesDelta: number | null; tenders: Array<{ mop: string; amount: number }> },
    tax: { categories: Array<{ category: string; taxableSales: number; netTax: number }> }
  ): string {
    const now = new Date().toISOString();
    const highTax = tax.categories.find((c) => c.category.toUpperCase() === 'HIGH TAX');
    const lowTax = tax.categories.find((c) => c.category.toUpperCase() === 'LOW TAX');
    const tender = (mop: string) => summary.tenders.find((t) => t.mop.toUpperCase() === mop)?.amount ?? 0;

    const existing = this.db.get<{ id: string }>(
      'SELECT id FROM commander_report_snapshots WHERE store_id=? AND period_filename=?',
      [storeId, period.filename]
    );
    const id = existing?.id ?? uuidv4();

    const values = [
      period.periodType, dateIso, period.filename, String(period.period),
      summary.fuelSales, summary.outsideSalesDelta,
      highTax?.taxableSales ?? 0, highTax?.netTax ?? 0,
      lowTax?.taxableSales ?? 0, lowTax?.netTax ?? 0,
      tender('CASH'), tender('CREDIT'), tender('DEBIT'),
      userId,
    ];

    if (existing) {
      this.db.run(
        `UPDATE commander_report_snapshots SET
           period_type=?, report_date=?, period_filename=?, period_value=?,
           fuel_sales=?, outside_sales_delta=?,
           high_tax_taxable=?, high_tax_net=?, low_tax_taxable=?, low_tax_net=?,
           cash_tender=?, credit_tender=?, debit_tender=?,
           captured_by=?, updated_at=?
         WHERE id=?`,
        [...values, now, id]
      );
    } else {
      this.db.run(
        `INSERT INTO commander_report_snapshots(
           id, store_id, period_type, report_date, period_filename, period_value,
           fuel_sales, outside_sales_delta,
           high_tax_taxable, high_tax_net, low_tax_taxable, low_tax_net,
           cash_tender, credit_tender, debit_tender,
           captured_by, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, storeId, ...values, now, now]
      );
    }

    return id;
  }

  private getSnapshot(id: string): CommanderSnapshotRow | undefined {
    return this.db.get<CommanderSnapshotRow>('SELECT * FROM commander_report_snapshots WHERE id=?', [id]);
  }

  /**
   * Manual daily sales entries vs. the captured DAILY department report,
   * plus any captured SHIFT snapshots for the same date for informal
   * comparison against that day's shift-close over/short figures.
   */
  getDailyReconciliation(storeId: string, dateIso: string): DailyReconciliation {
    const dailySnapshot = this.db.get<CommanderSnapshotRow>(
      'SELECT * FROM commander_report_snapshots WHERE store_id=? AND report_date=? AND period_type=2',
      [storeId, dateIso]
    ) ?? null;

    const manualEntries = this.db.all<{ department_name: string; amount: number }>(
      `SELECT d.name as department_name, m.amount FROM manual_sales_entries m
       JOIN departments d ON d.id = m.department_id
       WHERE m.store_id=? AND m.entry_date=?`,
      [storeId, dateIso]
    );

    const commanderLines = dailySnapshot
      ? this.db.all<{ department_name: string; net_sales: number }>(
          'SELECT department_name, net_sales FROM commander_department_report_lines WHERE snapshot_id=?',
          [dailySnapshot.id]
        )
      : [];

    const departmentVariance = buildVarianceRows(
      manualEntries.map((e) => ({ label: e.department_name, value: e.amount })),
      commanderLines.map((l) => ({ label: l.department_name, value: l.net_sales }))
    );

    const shiftSnapshots = this.db.all<CommanderSnapshotRow>(
      'SELECT * FROM commander_report_snapshots WHERE store_id=? AND report_date=? AND period_type=1 ORDER BY period_filename',
      [storeId, dateIso]
    );

    return {
      hasCommanderData: dailySnapshot !== null || shiftSnapshots.length > 0,
      dailySnapshot,
      departmentVariance,
      shiftSnapshots,
    };
  }
}
