/**
 * src/modules/audit/audit.service.ts
 *
 * Renderer-side facade for audit log retrieval.
 * All writes go through the main-process AuditLogger (append-only).
 */

export interface AuditEntry {
  id:            string;
  store_id:      string | null;
  user_id:       string | null;
  event_type:    string;
  event_subtype: string | null;
  description:   string;
  entity_type:   string | null;
  entity_id:     string | null;
  result:        'success' | 'failure' | 'warning';
  error_detail:  string | null;
  user_name:     string | null;
  created_at:    string;
}

export const AuditService = {
  async getRecent(limit = 100, offset = 0): Promise<AuditEntry[]> {
    return window.electronAPI.getAuditLog({ limit, offset }) as Promise<AuditEntry[]>;
  },
};
