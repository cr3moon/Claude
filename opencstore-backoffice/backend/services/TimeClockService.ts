/**
 * TimeClockService
 *
 * Employee clock-in/clock-out tracking, with a manager-editable correction
 * path (someone forgot to clock out — a real, routine occurrence) and
 * payroll-hours reporting. There is no "punch" concept beyond a single
 * clock_in/clock_out pair per shift, with one optional unpaid break
 * deduction — deliberately simpler than a full break-event log, matching
 * what an independent operator's payroll actually needs.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { computeHours } from '../../src/modules/timeclock/timeclock-rules';

export interface TimeClockSummaryRow {
  user_id: string;
  display_name: string;
  hours_worked: number;
  labor_cost: number | null;
}

export class TimeClockService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  // ─── Clock in / out ─────────────────────────────────────────────────────

  getOpenEntry(userId: string): unknown | null {
    return this.db.get(
      `SELECT * FROM time_clock_entries WHERE user_id=? AND clock_out IS NULL`, [userId]
    ) ?? null;
  }

  clockIn(storeId: string, userId: string): string {
    if (this.getOpenEntry(userId)) {
      throw new Error('Already clocked in.');
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      this.db.run(
        `INSERT INTO time_clock_entries(id,store_id,user_id,clock_in,break_minutes,created_at,updated_at)
         VALUES(?,?,?,?,0,?,?)`,
        [id, storeId, userId, now, now, now]
      );
    } catch {
      // The partial unique index (one open entry per user) is the
      // authoritative guard against a race between the getOpenEntry()
      // check above and this insert; surface it the same way.
      throw new Error('Already clocked in.');
    }
    this.audit.log({
      storeId, userId,
      eventType: 'time_clock', eventSubtype: 'clock_in',
      description: `Clocked in.`,
    });
    return id;
  }

  clockOut(storeId: string, userId: string, breakMinutes: number = 0): void {
    const entry = this.getOpenEntry(userId) as { id: string; clock_in: string } | null;
    if (!entry) throw new Error('Not currently clocked in.');

    const wage = this.db.get<{ hourly_wage: number | null }>('SELECT hourly_wage FROM users WHERE id=?', [userId]);
    const now = new Date().toISOString();
    const result = computeHours(entry.clock_in, now, breakMinutes, wage?.hourly_wage ?? null);

    this.db.run(
      `UPDATE time_clock_entries SET clock_out=?, break_minutes=?, updated_at=? WHERE id=?`,
      [now, breakMinutes, now, entry.id]
    );

    this.audit.log({
      storeId, userId,
      eventType: 'time_clock', eventSubtype: 'clock_out',
      description: `Clocked out. ${result.hoursWorked} hour(s) worked.`,
    });
  }

  /** Manager correction for an entry — e.g. someone forgot to clock out. */
  editEntry(entryId: string, storeId: string, editedByUserId: string, clockIn: string, clockOut: string, breakMinutes: number, reason: string): void {
    const entry = this.db.get<{ user_id: string }>('SELECT user_id FROM time_clock_entries WHERE id=? AND store_id=?', [entryId, storeId]);
    if (!entry) throw new Error('Entry not found.');
    if (!reason?.trim()) throw new Error('A reason is required for manual corrections.');

    const wage = this.db.get<{ hourly_wage: number | null }>('SELECT hourly_wage FROM users WHERE id=?', [entry.user_id]);
    computeHours(clockIn, clockOut, breakMinutes, wage?.hourly_wage ?? null); // validates; throws on a bad edit

    const now = new Date().toISOString();
    this.db.run(
      `UPDATE time_clock_entries SET clock_in=?, clock_out=?, break_minutes=?,
       edited_by=?, edited_at=?, edit_reason=?, updated_at=? WHERE id=?`,
      [clockIn, clockOut, breakMinutes, editedByUserId, now, reason.trim(), now, entryId]
    );

    this.audit.log({
      storeId, userId: editedByUserId,
      eventType: 'time_clock', eventSubtype: 'entry_edited',
      description: `Time entry for user ${entry.user_id} corrected: ${reason.trim()}`,
      entityId: entryId,
    });
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  listEntries(storeId: string, userId?: string): unknown[] {
    const sql = userId
      ? `SELECT e.*, u.display_name FROM time_clock_entries e JOIN users u ON u.id=e.user_id
         WHERE e.store_id=? AND e.user_id=? ORDER BY e.clock_in DESC LIMIT 200`
      : `SELECT e.*, u.display_name FROM time_clock_entries e JOIN users u ON u.id=e.user_id
         WHERE e.store_id=? ORDER BY e.clock_in DESC LIMIT 200`;
    return this.db.all(sql, userId ? [storeId, userId] : [storeId]);
  }

  listActiveUsers(storeId: string): unknown[] {
    return this.db.all(
      `SELECT id, display_name, role, hourly_wage,
              (SELECT id FROM time_clock_entries WHERE user_id=u.id AND clock_out IS NULL) as open_entry_id
       FROM users u WHERE store_id=? AND is_active=1 ORDER BY display_name`,
      [storeId]
    );
  }

  getPayrollSummary(storeId: string, startDate: string, endDate: string): TimeClockSummaryRow[] {
    const rows = this.db.all<{
      user_id: string; display_name: string; hourly_wage: number | null;
      clock_in: string; clock_out: string; break_minutes: number;
    }>(
      `SELECT e.user_id, u.display_name, u.hourly_wage, e.clock_in, e.clock_out, e.break_minutes
       FROM time_clock_entries e JOIN users u ON u.id = e.user_id
       WHERE e.store_id=? AND e.clock_out IS NOT NULL AND e.clock_in BETWEEN ? AND ?`,
      [storeId, startDate, endDate]
    );

    const byUser = new Map<string, { display_name: string; hours: number; cost: number | null; hasWage: boolean }>();
    for (const r of rows) {
      const result = computeHours(r.clock_in, r.clock_out, r.break_minutes, r.hourly_wage);
      const acc = byUser.get(r.user_id) ?? { display_name: r.display_name, hours: 0, cost: 0, hasWage: r.hourly_wage != null };
      acc.hours += result.hoursWorked;
      if (result.laborCost != null && acc.cost != null) acc.cost += result.laborCost;
      byUser.set(r.user_id, acc);
    }

    return [...byUser.entries()]
      .map(([user_id, v]) => ({
        user_id,
        display_name: v.display_name,
        hours_worked: Math.round(v.hours * 100) / 100,
        labor_cost: v.hasWage ? Math.round((v.cost ?? 0) * 100) / 100 : null,
      }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }
}
