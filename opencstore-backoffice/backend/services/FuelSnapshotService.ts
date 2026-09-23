/**
 * FuelSnapshotService
 *
 * Fuel Sales/Volume trend data. Commander only ever gives a live,
 * cumulative total for a period (shift/day/month/year) — it has no stored
 * daily history of its own. This service is the history: capturing
 * "today's total so far" into fuel_sales_snapshots (one row per grade per
 * day, upserted — capturing again the same day just updates it with the
 * latest running total) is what turns that live snapshot into a trend
 * line over time. The actual Commander call lives in app/main/index.ts
 * (it needs the live commanderClient), which passes the fetched totals in.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { fillMissingDays, type DayValue } from '../../src/modules/dashboard/dashboard-rules';

export interface FuelGradeTotalInput {
  grade: string;
  volumeGallons: number;
  revenueUsd: number;
}

export interface FuelTrendSeries {
  grade: string;
  points: DayValue[];
}

export class FuelSnapshotService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  captureFromTotals(storeId: string, userId: string, snapshotDate: string, totals: FuelGradeTotalInput[]): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const t of totals) {
        this.db.run(
          `INSERT INTO fuel_sales_snapshots(id,store_id,snapshot_date,grade,gallons,revenue,source,created_by,created_at,updated_at)
           VALUES(?,?,?,?,?,?,'commander',?,?,?)
           ON CONFLICT(store_id,snapshot_date,grade) DO UPDATE SET
             gallons=excluded.gallons, revenue=excluded.revenue, updated_at=excluded.updated_at`,
          [uuidv4(), storeId, snapshotDate, t.grade, t.volumeGallons, t.revenueUsd, userId, now, now]
        );
      }
    });
    this.audit.log({
      storeId, userId,
      eventType: 'fuel_snapshot', eventSubtype: 'captured',
      description: `Captured fuel totals for ${snapshotDate}: ${totals.map(t => t.grade).join(', ')}.`,
    });
  }

  hasSnapshotForDate(storeId: string, snapshotDate: string): boolean {
    const row = this.db.get('SELECT 1 FROM fuel_sales_snapshots WHERE store_id=? AND snapshot_date=? LIMIT 1', [storeId, snapshotDate]);
    return !!row;
  }

  /** Fuel Volume: one line per grade, zero-filled across the range. */
  getVolumeTrend(storeId: string, startDate: string, endDate: string): FuelTrendSeries[] {
    return this.buildTrend(storeId, startDate, endDate, 'gallons');
  }

  /** Fuel Sales ($): summed across all grades, per day, zero-filled — one bar series. */
  getRevenueTrend(storeId: string, startDate: string, endDate: string): DayValue[] {
    const rows = this.db.all<{ date: string; value: number }>(
      `SELECT snapshot_date as date, SUM(revenue) as value FROM fuel_sales_snapshots
       WHERE store_id=? AND snapshot_date BETWEEN ? AND ? GROUP BY snapshot_date`,
      [storeId, startDate, endDate]
    );
    return fillMissingDays(rows, startDate, endDate);
  }

  getPeriodTotals(storeId: string, startDate: string, endDate: string): { gallons: number; revenue: number } {
    const row = this.db.get<{ gallons: number; revenue: number }>(
      `SELECT COALESCE(SUM(gallons),0) as gallons, COALESCE(SUM(revenue),0) as revenue
       FROM fuel_sales_snapshots WHERE store_id=? AND snapshot_date BETWEEN ? AND ?`,
      [storeId, startDate, endDate]
    );
    return row ?? { gallons: 0, revenue: 0 };
  }

  private buildTrend(storeId: string, startDate: string, endDate: string, column: 'gallons' | 'revenue'): FuelTrendSeries[] {
    const rows = this.db.all<{ grade: string; date: string; value: number }>(
      `SELECT grade, snapshot_date as date, ${column} as value FROM fuel_sales_snapshots
       WHERE store_id=? AND snapshot_date BETWEEN ? AND ? ORDER BY grade`,
      [storeId, startDate, endDate]
    );
    const byGrade = new Map<string, { date: string; value: number }[]>();
    for (const r of rows) {
      const arr = byGrade.get(r.grade) ?? [];
      arr.push({ date: r.date, value: r.value });
      byGrade.set(r.grade, arr);
    }
    return [...byGrade.entries()].map(([grade, points]) => ({
      grade,
      points: fillMissingDays(points, startDate, endDate),
    }));
  }
}
