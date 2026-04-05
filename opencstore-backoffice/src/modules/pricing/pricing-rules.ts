/**
 * src/modules/pricing/pricing-rules.ts
 *
 * Configurable pricing rule definitions.
 * Each rule specifies the condition, target margin range, and how the
 * recommended price should be computed.
 *
 * Rules are pure data – the pricing engine evaluates them per-item.
 * Operators can tune targets without touching engine logic.
 */

export type PricingRuleCode =
  | 'PRICE_BELOW_COST'
  | 'ZERO_MARGIN'
  | 'MARGIN_BELOW_TARGET'
  | 'BAD_PRICE_ENDING'
  | 'LOW_VOLUME_LOW_MARGIN';

export interface DeptMarginRule {
  /** Regex matched against department name (case-insensitive) */
  pattern:       RegExp;
  /** Ideal gross margin % (0–100) */
  targetMarginPct: number;
  /** Minimum acceptable gross margin % */
  minMarginPct:    number;
  /** Department label shown in reason text */
  label:          string;
}

/** Default margin targets by department – tune as needed per store */
export const DEPT_MARGIN_RULES: DeptMarginRule[] = [
  { pattern: /tobacco|cigaret|cigar|smokeless|vape|nicotine/i, targetMarginPct: 30, minMarginPct: 18, label: 'Tobacco'           },
  { pattern: /beer|wine|liquor|alcohol|spirit|malt/i,          targetMarginPct: 28, minMarginPct: 16, label: 'Beer & Wine'        },
  { pattern: /packaged bev|carbonated|energy drink|sports drink|water|juice/i,
                                                                targetMarginPct: 40, minMarginPct: 26, label: 'Packaged Beverages' },
  { pattern: /snack|chip|crisp|pretzel|popcorn/i,              targetMarginPct: 45, minMarginPct: 30, label: 'Snacks'             },
  { pattern: /candy|chocolate|gum|mint/i,                      targetMarginPct: 45, minMarginPct: 30, label: 'Candy'              },
  { pattern: /jerky|meat snack/i,                              targetMarginPct: 40, minMarginPct: 28, label: 'Meat Snacks'        },
  { pattern: /grocery|general merchandise|misc/i,              targetMarginPct: 35, minMarginPct: 20, label: 'Grocery'            },
  { pattern: /dairy|milk|egg|cheese/i,                         targetMarginPct: 20, minMarginPct: 10, label: 'Dairy'              },
  { pattern: /hot food|deli|bakery|prepared/i,                 targetMarginPct: 55, minMarginPct: 40, label: 'Hot Food'           },
  { pattern: /car care|auto|motor/i,                           targetMarginPct: 45, minMarginPct: 30, label: 'Car Care'           },
  { pattern: /health|beauty|personal care/i,                   targetMarginPct: 40, minMarginPct: 28, label: 'Health & Beauty'    },
];

/** Fallback margin targets when no department rule matches */
export const FALLBACK_MARGIN: Pick<DeptMarginRule, 'targetMarginPct' | 'minMarginPct' | 'label'> = {
  targetMarginPct: 35,
  minMarginPct:    20,
  label:           'General',
};

/** Accepted price endings (decimal portion).  Applied in order; first match wins. */
export const PRICE_ENDINGS: number[] = [0.99, 0.89, 0.79, 0.69, 0.59, 0.49, 0.39, 0.29, 0.19, 0.09, 0.00];

/** Minimum price change worth recommending (avoid penny-rounding noise) */
export const MIN_PRICE_CHANGE = 0.03;

/** Resolve the margin rule for a given department name */
export function resolveDeptRule(deptName: string | null): DeptMarginRule {
  if (!deptName) return { ...FALLBACK_MARGIN, pattern: /.*/ };
  const rule = DEPT_MARGIN_RULES.find(r => r.pattern.test(deptName));
  return rule ?? { ...FALLBACK_MARGIN, pattern: /.*/ };
}
