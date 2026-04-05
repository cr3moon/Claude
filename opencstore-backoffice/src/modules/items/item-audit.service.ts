/**
 * src/modules/items/item-audit.service.ts
 *
 * Renderer-side facade over the IPC-backed ItemAuditService.
 * Business logic lives in backend/services/ItemAuditService.ts (main process).
 * This module provides typed helpers so page components stay clean.
 */

export interface ItemRecommendation {
  id:                    string;
  store_id:              string;
  plu_item_id:           string;
  job_run_id:            string;
  pos_plu_id:            string;
  description:           string;
  dept_name:             string | null;
  field_name:            string;
  current_value:         string | null;
  recommended_value:     string | null;
  reason:                string;
  rule_code:             string;
  confidence:            number;
  requires_manual_review: number;
  status:                'pending' | 'approved' | 'rejected' | 'applied';
  reviewed_by:           string | null;
  reviewed_at:           string | null;
  review_notes:          string | null;
  created_at:            string;
}

export interface AuditRunSummary {
  jobRunId:             string;
  totalItems:           number;
  totalRecommendations: number;
  ruleBreakdown:        Record<string, number>;
}

export const ItemAuditService = {
  /** Run a full audit and return the summary */
  async runAudit(): Promise<AuditRunSummary> {
    return window.electronAPI.runItemAudit() as Promise<AuditRunSummary>;
  },

  /** Fetch all pending recommendations (optionally filtered by run) */
  async getPending(jobRunId?: string): Promise<ItemRecommendation[]> {
    return window.electronAPI.getPendingItemRecs(jobRunId) as Promise<ItemRecommendation[]>;
  },

  async approve(id: string, notes?: string): Promise<void> {
    await window.electronAPI.approveItemRec(id, notes);
  },

  async reject(id: string, notes?: string): Promise<void> {
    await window.electronAPI.rejectItemRec(id, notes);
  },
};
