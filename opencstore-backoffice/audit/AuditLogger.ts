/**
 * AuditLogger
 *
 * Append-only audit trail for all important application events.
 * The audit_log table is never updated or deleted by application code.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from '../backend/services/DatabaseService';

export interface AuditEntry {
  storeId?: string;
  userId?: string;
  sessionId?: string;
  eventType: string;
  eventSubtype?: string;
  description: string;
  entityType?: string;
  entityId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  result?: 'success' | 'failure' | 'warning';
  errorDetail?: string;
}

export class AuditLogger {
  constructor(private db: DatabaseService) {}

  log(entry: AuditEntry): void {
    const now = new Date().toISOString();
    try {
      this.db.run(
        `INSERT INTO audit_log(id,store_id,user_id,session_id,event_type,event_subtype,
         description,entity_type,entity_id,before_state,after_state,result,error_detail,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuidv4(),
          entry.storeId ?? null,
          entry.userId ?? null,
          entry.sessionId ?? null,
          entry.eventType,
          entry.eventSubtype ?? null,
          entry.description,
          entry.entityType ?? null,
          entry.entityId ?? null,
          entry.beforeState ? JSON.stringify(entry.beforeState) : null,
          entry.afterState ? JSON.stringify(entry.afterState) : null,
          entry.result ?? 'success',
          entry.errorDetail ?? null,
          now,
        ]
      );
    } catch {
      // Audit failures must never crash the application
      console.error('[AuditLogger] Failed to write audit entry:', entry.description);
    }
  }

  getRecent(storeId: string, limit = 100, offset = 0): unknown[] {
    return this.db.all(
      `SELECT a.*, u.display_name as user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.store_id = ?
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [storeId, limit, offset]
    );
  }

  getByEventType(storeId: string, eventType: string, limit = 50): unknown[] {
    return this.db.all(
      `SELECT * FROM audit_log WHERE store_id=? AND event_type=?
       ORDER BY created_at DESC LIMIT ?`,
      [storeId, eventType, limit]
    );
  }

  countByDay(storeId: string, days = 30): unknown[] {
    return this.db.all(
      `SELECT substr(created_at,1,10) as day, event_type, COUNT(*) as cnt
       FROM audit_log WHERE store_id=? AND created_at >= datetime('now',?)
       GROUP BY day, event_type ORDER BY day DESC`,
      [storeId, `-${days} days`]
    );
  }
}
