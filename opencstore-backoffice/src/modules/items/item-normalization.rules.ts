/**
 * src/modules/items/item-normalization.rules.ts
 *
 * Configurable rule definitions for the item audit engine.
 * Rules are data objects – the audit service iterates them against each item.
 * Add, disable, or tune rules here without touching the engine logic.
 *
 * Classification guidance is based on widely-observed convenience-store
 * merchandising practices.  No official Conexxus certification is claimed.
 */

export type RuleCode =
  | 'BLANK_DESC'
  | 'BLANK_SHORT_DESC'
  | 'SHORT_DESC_TOO_LONG'
  | 'DUPLICATE_UPC'
  | 'DUPLICATE_DESC'
  | 'MISSING_UPC'
  | 'BAD_UPC_LENGTH'
  | 'MISSING_DEPT'
  | 'MISSING_CATEGORY'
  | 'MISSING_PRODUCT_CODE'
  | 'INCONSISTENT_UOM'
  | 'WRONG_TAX_TOBACCO'
  | 'WRONG_AGE_TOBACCO'
  | 'WRONG_AGE_ALCOHOL'
  | 'WRONG_DEPT_ENERGY'
  | 'NO_COST'
  | 'NO_PRICE'
  | 'PRICE_BELOW_COST'
  | 'INCONSISTENT_PACK_WORDING';

export interface NormalizationRule {
  ruleCode:            RuleCode;
  issueType:           string;
  description:         string;
  defaultConfidence:   number;   // 0–1
  requiresManualReview: boolean;
  enabled:             boolean;
}

export const NORMALIZATION_RULES: NormalizationRule[] = [
  {
    ruleCode:             'BLANK_DESC',
    issueType:            'missing_data',
    description:          'Item has no description. A name is required for receipts and reports.',
    defaultConfidence:    1.0,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'BLANK_SHORT_DESC',
    issueType:            'missing_data',
    description:          'Item is missing a short description (receipt abbreviation).',
    defaultConfidence:    0.85,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'SHORT_DESC_TOO_LONG',
    issueType:            'formatting',
    description:          'Short description exceeds 12 characters and may be truncated on receipt printers.',
    defaultConfidence:    0.90,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'DUPLICATE_UPC',
    issueType:            'data_integrity',
    description:          'Barcode is shared by more than one PLU item. POS will ring the wrong item.',
    defaultConfidence:    1.0,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'DUPLICATE_DESC',
    issueType:            'data_integrity',
    description:          'Description is identical to another item. Duplicate names cause reporting confusion.',
    defaultConfidence:    0.90,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'MISSING_UPC',
    issueType:            'missing_data',
    description:          'Item has no scan code. Cashiers cannot scan this item at the register.',
    defaultConfidence:    0.95,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'BAD_UPC_LENGTH',
    issueType:            'formatting',
    description:          'Barcode digit count is non-standard (not 8, 12, 13, or 14 digits).',
    defaultConfidence:    0.90,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'MISSING_DEPT',
    issueType:            'missing_data',
    description:          'Item is not assigned to any department. Sales reporting will be incomplete.',
    defaultConfidence:    1.0,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'MISSING_CATEGORY',
    issueType:            'missing_data',
    description:          'Item has no category. Category-level reports will be inaccurate.',
    defaultConfidence:    0.90,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'MISSING_PRODUCT_CODE',
    issueType:            'missing_data',
    description:          'Item has no vendor or product code. Ordering and invoice matching may be affected.',
    defaultConfidence:    0.70,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'INCONSISTENT_UOM',
    issueType:            'formatting',
    description:          'Unit of measure is not uppercase (e.g. "ea" should be "EA").',
    defaultConfidence:    0.95,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'WRONG_TAX_TOBACCO',
    issueType:            'compliance',
    description:          'Tobacco item is not flagged as taxable. Verify for your jurisdiction.',
    defaultConfidence:    0.85,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'WRONG_AGE_TOBACCO',
    issueType:            'compliance',
    description:          'Tobacco/nicotine item is missing the age-restriction flag. Required by law.',
    defaultConfidence:    0.98,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'WRONG_AGE_ALCOHOL',
    issueType:            'compliance',
    description:          'Alcohol item is missing the age-restriction flag. Required by law.',
    defaultConfidence:    0.98,
    requiresManualReview: false,
    enabled:              true,
  },
  {
    ruleCode:             'WRONG_DEPT_ENERGY',
    issueType:            'classification',
    description:          'Energy drink appears to be in a generic grocery department. Reclassify to Packaged Beverages.',
    defaultConfidence:    0.80,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'NO_COST',
    issueType:            'missing_data',
    description:          'Item has no cost on file. Margin calculations and pricing recommendations unavailable.',
    defaultConfidence:    0.90,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'NO_PRICE',
    issueType:            'missing_data',
    description:          'Item has no retail price. It cannot be sold at the register.',
    defaultConfidence:    1.0,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'PRICE_BELOW_COST',
    issueType:            'pricing',
    description:          'Retail price is below cost. Item is selling at a loss.',
    defaultConfidence:    0.99,
    requiresManualReview: true,
    enabled:              true,
  },
  {
    ruleCode:             'INCONSISTENT_PACK_WORDING',
    issueType:            'formatting',
    description:          'Pack size wording is inconsistent with department conventions (e.g. "6pk" vs "6PK").',
    defaultConfidence:    0.75,
    requiresManualReview: false,
    enabled:              true,
  },
];

/** Quick lookup by rule code */
export const RULES_BY_CODE: Record<RuleCode, NormalizationRule> = Object.fromEntries(
  NORMALIZATION_RULES.map(r => [r.ruleCode, r])
) as Record<RuleCode, NormalizationRule>;

/** All enabled rule codes */
export const ENABLED_RULES: NormalizationRule[] = NORMALIZATION_RULES.filter(r => r.enabled);
