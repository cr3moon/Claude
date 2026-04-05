/**
 * src/modules/pricing/pricing-engine.service.ts
 *
 * Renderer-side facade over the IPC-backed PricingService.
 * Also exposes pure calculation helpers that the UI can use client-side.
 */

import { grossMarginPct, applyPriceEnding, round2 } from '../../lib/currency';
import { resolveDeptRule, MIN_PRICE_CHANGE } from './pricing-rules';

export interface PriceRecommendation {
  id:                   string;
  plu_item_id:          string;
  pos_plu_id:           string;
  description:          string;
  dept_name:            string | null;
  current_retail:       number;
  current_cost:         number | null;
  current_margin_pct:   number | null;
  recommended_retail:   number;
  estimated_margin_pct: number | null;
  reason:               string;
  rule_code:            string;
  confidence:           number;
  status:               'pending' | 'approved' | 'rejected' | 'applied';
  reviewed_at:          string | null;
}

export interface PricingRunSummary {
  jobRunId:             string;
  totalItems:           number;
  totalRecommendations: number;
  ruleBreakdown:        Record<string, number>;
}

// ─── IPC-backed service ───────────────────────────────────────────────────────

export const PricingEngineService = {
  async runAnalysis(): Promise<PricingRunSummary> {
    return window.electronAPI.runPricingAnalysis() as Promise<PricingRunSummary>;
  },

  async getPending(jobRunId?: string): Promise<PriceRecommendation[]> {
    return window.electronAPI.getPendingPriceRecs(jobRunId) as Promise<PriceRecommendation[]>;
  },

  async approve(id: string, notes?: string): Promise<void> {
    await window.electronAPI.approvePriceRec(id, notes);
  },

  async reject(id: string, notes?: string): Promise<void> {
    await window.electronAPI.rejectPriceRec(id, notes);
  },

  async exportApproved(): Promise<{ success: boolean; exportPath?: string; count?: number }> {
    return window.electronAPI.exportApprovedPrices() as Promise<{ success: boolean; exportPath?: string; count?: number }>;
  },
};

// ─── Pure calculation helpers (no IPC) ───────────────────────────────────────

/**
 * Compute a suggested retail price for an item given its cost and department.
 * Returns null if data is insufficient.
 */
export function suggestRetail(
  cost: number,
  deptName: string | null,
  currentRetail?: number
): { suggestedRetail: number; estimatedMarginPct: number; reason: string } | null {
  if (!cost || cost <= 0) return null;

  const rule     = resolveDeptRule(deptName);
  const rawPrice = cost / (1 - rule.targetMarginPct / 100);
  const suggested = applyPriceEnding(rawPrice);

  // Skip if change would be trivially small
  if (currentRetail !== undefined && Math.abs(suggested - currentRetail) < MIN_PRICE_CHANGE) {
    return null;
  }

  const margin = grossMarginPct(suggested, cost) ?? 0;
  return {
    suggestedRetail:   suggested,
    estimatedMarginPct: round2(margin),
    reason: `Suggested retail achieves ~${rule.targetMarginPct}% margin for ${rule.label}.`,
  };
}

/**
 * Quick margin impact summary for a price change.
 */
export function marginImpact(cost: number, oldRetail: number, newRetail: number) {
  const oldMargin = grossMarginPct(oldRetail, cost);
  const newMargin = grossMarginPct(newRetail, cost);
  const delta     = (newMargin ?? 0) - (oldMargin ?? 0);
  return {
    oldMarginPct: oldMargin,
    newMarginPct: newMargin,
    deltaMarginPct: round2(delta),
    oldGpDollars: round2(oldRetail - cost),
    newGpDollars: round2(newRetail - cost),
  };
}
