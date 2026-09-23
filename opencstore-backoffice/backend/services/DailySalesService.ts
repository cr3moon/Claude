/**
 * DailySalesService
 *
 * Manual daily sales entry by department — the dashboard's stand-in for a
 * live POS transaction feed, which this app doesn't have (see schema.sql's
 * note above manual_sales_entries). One row per store/date/department;
 * re-entering a day updates it rather than duplicating. Feeds both the
 * Department Sales breakdown (grouped by department, summed over a range)
 * and the Merchandise Sales daily trend (grouped by date, summed across
 * departments) from the same entries.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { validateSalesEntryAmount, foldIntoTopCategories, fillMissingDays, type DayValue, type CategoryValue } from '../../src/modules/dashboard/dashboard-rules';

export class DailySalesService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  upsertEntry(storeId: string, userId: string, entryDate: string, departmentId: string, amount: number): void {
    validateSalesEntryAmount(amount);
    const dept = this.db.get<{ id: string }>('SELECT id FROM departments WHERE id=? AND store_id=?', [departmentId, storeId]);
    if (!dept) throw new Error('Department not found.');

    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO manual_sales_entries(id,store_id,entry_date,department_id,amount,entered_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(store_id,entry_date,department_id) DO UPDATE SET amount=excluded.amount, updated_at=excluded.updated_at`,
      [uuidv4(), storeId, entryDate, departmentId, amount, userId, now, now]
    );

    this.audit.log({
      storeId, userId,
      eventType: 'sales_entry', eventSubtype: 'upserted',
      description: `Daily sales entry for ${entryDate}, department ${departmentId}: $${amount.toFixed(2)}.`,
    });
  }

  getEntriesForDate(storeId: string, entryDate: string): unknown[] {
    return this.db.all(
      `SELECT m.*, d.name as department_name FROM manual_sales_entries m
       JOIN departments d ON d.id = m.department_id
       WHERE m.store_id=? AND m.entry_date=? ORDER BY d.name`,
      [storeId, entryDate]
    );
  }

  /** Department Sales: total per department across the range, top N + "Other". */
  getDepartmentTotals(storeId: string, startDate: string, endDate: string, maxCategories = 8): CategoryValue[] {
    const rows = this.db.all<{ category: string; value: number }>(
      `SELECT d.name as category, SUM(m.amount) as value
       FROM manual_sales_entries m JOIN departments d ON d.id = m.department_id
       WHERE m.store_id=? AND m.entry_date BETWEEN ? AND ?
       GROUP BY d.id`,
      [storeId, startDate, endDate]
    );
    return foldIntoTopCategories(rows, maxCategories);
  }

  /** Merchandise Sales: total across all departments, per day, zero-filled. */
  getDailyTotals(storeId: string, startDate: string, endDate: string): DayValue[] {
    const rows = this.db.all<{ date: string; value: number }>(
      `SELECT entry_date as date, SUM(amount) as value FROM manual_sales_entries
       WHERE store_id=? AND entry_date BETWEEN ? AND ? GROUP BY entry_date`,
      [storeId, startDate, endDate]
    );
    return fillMissingDays(rows, startDate, endDate);
  }

  getPeriodTotal(storeId: string, startDate: string, endDate: string): number {
    const row = this.db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount),0) as total FROM manual_sales_entries
       WHERE store_id=? AND entry_date BETWEEN ? AND ?`,
      [storeId, startDate, endDate]
    );
    return row?.total ?? 0;
  }
}
