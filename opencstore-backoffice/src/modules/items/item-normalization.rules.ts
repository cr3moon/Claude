/**
 * src/modules/items/item-normalization.rules.ts
 *
 * Executable rule definitions for the item audit engine.
 * Each rule is a pure predicate over a single PLU item — the engine runs every
 * enabled rule against every item and records a recommendation for each match.
 *
 * Classification guidance is based on widely-observed convenience-store
 * merchandising practices.  No official Conexxus certification is claimed.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface RawPluItem {
  pos_plu_id:     string;
  description:    string;
  short_desc?:    string | null;
  upc_code?:      string | null;
  dept_name?:     string | null;
  category_name?: string | null;
  unit_price:     number;
  cost?:          number | null;
  tax_rate?:      number;
  active?:        boolean;
}

export interface NormalizationRule {
  code:     string;
  severity: Severity;
  message:  string;
  check:    (item: RawPluItem) => boolean;
}

export const NORMALIZATION_RULES: NormalizationRule[] = [
  {
    code:     'MISSING_DESC',
    severity: 'error',
    message:  'Item has no description. A name is required for receipts and reports.',
    check:    item => !item.description || item.description.trim() === '',
  },
  {
    code:     'MISSING_SHORT_DESC',
    severity: 'warning',
    message:  'Item is missing a short description (receipt abbreviation).',
    check:    item => !item.short_desc || item.short_desc.trim() === '',
  },
  {
    code:     'SHORT_DESC_TOO_LONG',
    severity: 'warning',
    message:  'Short description exceeds 12 characters and may be truncated on receipt printers.',
    check:    item => !!item.short_desc && item.short_desc.length > 12,
  },
  {
    code:     'MISSING_PRICE',
    severity: 'error',
    message:  'Item has no retail price. It cannot be sold at the register.',
    check:    item => item.unit_price === undefined || item.unit_price === null || item.unit_price <= 0,
  },
  {
    code:     'NEGATIVE_MARGIN',
    severity: 'error',
    message:  'Retail price is below cost. Item is selling at a loss.',
    check:    item => (item.cost ?? 0) > 0 && item.cost! > item.unit_price,
  },
  {
    code:     'MISSING_DEPT',
    severity: 'warning',
    message:  'Item is not assigned to any department. Sales reporting will be incomplete.',
    check:    item => !item.dept_name || item.dept_name.trim() === '',
  },
  {
    code:     'MISSING_CATEGORY',
    severity: 'warning',
    message:  'Item has no category. Category-level reports will be inaccurate.',
    check:    item => !item.category_name || item.category_name.trim() === '',
  },
  {
    code:     'MISSING_UPC',
    severity: 'warning',
    message:  'Item has no scan code. Cashiers cannot scan this item at the register.',
    check:    item => !item.upc_code,
  },
  {
    code:     'INVALID_UPC',
    severity: 'error',
    message:  'Barcode is non-standard: not all-digits or fewer than 8 digits.',
    check:    item => {
      if (!item.upc_code) return false; // optional — MISSING_UPC covers absence
      const digitsOnly = /^\d+$/.test(item.upc_code);
      return !digitsOnly || item.upc_code.length < 8;
    },
  },
  {
    code:     'MISSING_COST',
    severity: 'info',
    message:  'Item has no cost on file. Margin calculations will be unavailable.',
    check:    item => item.cost === null || item.cost === undefined,
  },
  {
    code:     'HIGH_TAX_RATE',
    severity: 'info',
    message:  'Tax rate looks unusually high — verify this is intentional.',
    check:    item => (item.tax_rate ?? 0) > 15,
  },
  {
    code:     'LONG_DESCRIPTION',
    severity: 'warning',
    message:  'Description is unusually long and may not display well on receipts.',
    check:    item => (item.description ?? '').length > 40,
  },
  {
    code:     'INACTIVE_ITEM',
    severity: 'info',
    message:  'Item is marked inactive.',
    check:    item => item.active === false,
  },
  {
    code:     'ZERO_PRICE_WITH_COST',
    severity: 'warning',
    message:  'Item has cost data on file but no retail price set.',
    check:    item => item.unit_price === 0 && (item.cost ?? 0) > 0,
  },
  {
    code:     'ROUND_DOLLAR_PRICE',
    severity: 'info',
    message:  'Price is an exact whole dollar amount — verify a price-ending strategy wasn\'t skipped.',
    check:    item => item.unit_price > 0 && Number.isInteger(item.unit_price),
  },
];

/** Quick lookup by rule code */
export const RULES_BY_CODE: Record<string, NormalizationRule> = Object.fromEntries(
  NORMALIZATION_RULES.map(r => [r.code, r])
);

/** Codes of every rule the engine runs */
export const ENABLED_RULES: string[] = NORMALIZATION_RULES.map(r => r.code);
