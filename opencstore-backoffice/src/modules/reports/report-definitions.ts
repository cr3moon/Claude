/**
 * src/modules/reports/report-definitions.ts
 *
 * Metadata for every supported report type.
 * Used by the Reports page to build the selector and by the export service
 * to know which columns to include in CSV/PDF output.
 */

export type ReportType =
  | 'daily_shift'
  | 'eod_close'
  | 'sales_by_dept'
  | 'sales_by_category'
  | 'sales_by_item'
  | 'tender_summary'
  | 'tax_summary'
  | 'voids_refunds'
  | 'cashier_performance'
  | 'margin_report'
  | 'price_change_history'
  | 'item_compliance'
  | 'over_short'
  | 'weekly_summary'
  | 'monthly_summary'
  | 'yearly_summary';

export interface ReportDefinition {
  type:           ReportType;
  label:          string;
  description:    string;
  supportsShift:  boolean;
  /** Column keys expected in the data rows */
  columns:        ReportColumn[];
  category:       'sales' | 'operations' | 'compliance' | 'pricing';
}

export interface ReportColumn {
  key:       string;
  label:     string;
  format:    'text' | 'currency' | 'percent' | 'integer' | 'datetime' | 'date';
  align?:    'left' | 'right' | 'center';
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    type: 'daily_shift', label: 'Daily Shift Summary', category: 'sales',
    description: 'Sales totals, tender breakdown, voids, and tax for a single day.',
    supportsShift: true,
    columns: [
      { key: 'department', label: 'Department', format: 'text' },
      { key: 'gross_sales', label: 'Gross Sales', format: 'currency', align: 'right' },
      { key: 'discounts',   label: 'Discounts',   format: 'currency', align: 'right' },
      { key: 'net_sales',   label: 'Net Sales',    format: 'currency', align: 'right' },
      { key: 'units_sold',  label: 'Units',        format: 'integer',  align: 'right' },
    ],
  },
  {
    type: 'eod_close', label: 'End-of-Day Close', category: 'operations',
    description: 'Full day close packet: sales, tenders, cash, over/short.',
    supportsShift: false,
    columns: [
      { key: 'metric', label: 'Metric', format: 'text' },
      { key: 'value',  label: 'Value',  format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'sales_by_dept', label: 'Sales by Department', category: 'sales',
    description: 'Gross sales, discounts, and units sold grouped by department.',
    supportsShift: true,
    columns: [
      { key: 'department',           label: 'Department',      format: 'text' },
      { key: 'gross_sales',          label: 'Gross Sales',      format: 'currency', align: 'right' },
      { key: 'discounts',            label: 'Discounts',        format: 'currency', align: 'right' },
      { key: 'units_sold',           label: 'Units',            format: 'integer',  align: 'right' },
      { key: 'gross_margin_dollars', label: 'Gross Margin $',   format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'sales_by_category', label: 'Sales by Category', category: 'sales',
    description: 'Sales breakdown by product category within each department.',
    supportsShift: true,
    columns: [
      { key: 'department',  label: 'Department',  format: 'text' },
      { key: 'category',    label: 'Category',    format: 'text' },
      { key: 'gross_sales', label: 'Gross Sales', format: 'currency', align: 'right' },
      { key: 'units_sold',  label: 'Units',       format: 'integer',  align: 'right' },
    ],
  },
  {
    type: 'sales_by_item', label: 'Sales by Item', category: 'sales',
    description: 'Individual item sales with margin data.',
    supportsShift: false,
    columns: [
      { key: 'pos_plu_id',   label: 'PLU',        format: 'text' },
      { key: 'description',  label: 'Description', format: 'text' },
      { key: 'department',   label: 'Dept',        format: 'text' },
      { key: 'units_sold',   label: 'Units',       format: 'integer',  align: 'right' },
      { key: 'gross_sales',  label: 'Sales $',     format: 'currency', align: 'right' },
      { key: 'retail_price', label: 'Retail',      format: 'currency', align: 'right' },
      { key: 'margin_pct',   label: 'Margin %',    format: 'percent',  align: 'right' },
    ],
  },
  {
    type: 'tender_summary', label: 'Tender Summary', category: 'sales',
    description: 'Sales totals broken down by payment type.',
    supportsShift: true,
    columns: [
      { key: 'tender_type',   label: 'Tender',        format: 'text' },
      { key: 'count',         label: 'Transactions',  format: 'integer',  align: 'right' },
      { key: 'total_amount',  label: 'Total',         format: 'currency', align: 'right' },
      { key: 'change_given',  label: 'Change Given',  format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'tax_summary', label: 'Tax Summary', category: 'sales',
    description: 'Taxable sales and tax collected by department.',
    supportsShift: false,
    columns: [
      { key: 'department',    label: 'Department',    format: 'text' },
      { key: 'taxable_sales', label: 'Taxable Sales', format: 'currency', align: 'right' },
      { key: 'total_tax',     label: 'Tax Collected', format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'voids_refunds', label: 'Voids & Refunds', category: 'operations',
    description: 'All void and refund transactions for the period.',
    supportsShift: true,
    columns: [
      { key: 'txn_at',       label: 'Date/Time',    format: 'datetime' },
      { key: 'txn_type',     label: 'Type',         format: 'text' },
      { key: 'cashier_name', label: 'Cashier',      format: 'text' },
      { key: 'total',        label: 'Amount',       format: 'currency', align: 'right' },
      { key: 'pos_txn_id',   label: 'POS Txn ID',   format: 'text' },
    ],
  },
  {
    type: 'cashier_performance', label: 'Cashier Performance', category: 'operations',
    description: 'Sales, voids, refunds, and discounts by cashier.',
    supportsShift: false,
    columns: [
      { key: 'cashier_name',  label: 'Cashier',     format: 'text' },
      { key: 'sale_count',    label: 'Sales #',     format: 'integer',  align: 'right' },
      { key: 'total_sales',   label: 'Sales $',     format: 'currency', align: 'right' },
      { key: 'void_count',    label: 'Voids #',     format: 'integer',  align: 'right' },
      { key: 'total_voids',   label: 'Voids $',     format: 'currency', align: 'right' },
      { key: 'total_discounts','label':'Discounts $',format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'margin_report', label: 'Margin Report', category: 'pricing',
    description: 'Cost, retail, and gross margin for all active items.',
    supportsShift: false,
    columns: [
      { key: 'pos_plu_id',    label: 'PLU',        format: 'text' },
      { key: 'description',   label: 'Description', format: 'text' },
      { key: 'department',    label: 'Dept',        format: 'text' },
      { key: 'cost',          label: 'Cost',        format: 'currency', align: 'right' },
      { key: 'retail_price',  label: 'Retail',      format: 'currency', align: 'right' },
      { key: 'margin_pct',    label: 'Margin %',    format: 'percent',  align: 'right' },
      { key: 'margin_dollars','label':'Margin $',   format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'price_change_history', label: 'Price Change History', category: 'pricing',
    description: 'Record of all price changes with before/after values.',
    supportsShift: false,
    columns: [
      { key: 'created_at',     label: 'Date',        format: 'datetime' },
      { key: 'description',    label: 'Item',        format: 'text' },
      { key: 'old_retail',     label: 'Old Price',   format: 'currency', align: 'right' },
      { key: 'new_retail',     label: 'New Price',   format: 'currency', align: 'right' },
      { key: 'old_margin_pct', label: 'Old Margin',  format: 'percent',  align: 'right' },
      { key: 'new_margin_pct', label: 'New Margin',  format: 'percent',  align: 'right' },
      { key: 'changed_by_name','label':'Changed By', format: 'text' },
    ],
  },
  {
    type: 'item_compliance', label: 'Item Standards Compliance', category: 'compliance',
    description: 'Summary of data quality issues detected by the item audit engine.',
    supportsShift: false,
    columns: [
      { key: 'rule_code', label: 'Rule',  format: 'text' },
      { key: 'cnt',       label: 'Count', format: 'integer', align: 'right' },
    ],
  },
  {
    type: 'over_short', label: 'Over/Short Summary', category: 'operations',
    description: 'Cash over/short amounts by shift.',
    supportsShift: false,
    columns: [
      { key: 'opened_at',    label: 'Shift Open',  format: 'datetime' },
      { key: 'cashier_name', label: 'Cashier',     format: 'text' },
      { key: 'expected_cash','label':'Expected $', format: 'currency', align: 'right' },
      { key: 'closing_cash', label: 'Actual $',    format: 'currency', align: 'right' },
      { key: 'over_short',   label: 'Over/Short',  format: 'currency', align: 'right' },
    ],
  },
  {
    type: 'weekly_summary',  label: 'Weekly Summary',  category: 'sales',
    description: 'Sales totals rolled up by week.',
    supportsShift: false,
    columns: [
      { key: 'week_start',  label: 'Week',       format: 'date' },
      { key: 'gross_sales', label: 'Gross Sales',format: 'currency', align: 'right' },
      { key: 'txn_count',   label: 'Transactions',format: 'integer', align: 'right' },
    ],
  },
  {
    type: 'monthly_summary', label: 'Monthly Summary', category: 'sales',
    description: 'Sales totals rolled up by calendar month.',
    supportsShift: false,
    columns: [
      { key: 'month',       label: 'Month',      format: 'text' },
      { key: 'gross_sales', label: 'Gross Sales',format: 'currency', align: 'right' },
      { key: 'txn_count',   label: 'Transactions',format: 'integer', align: 'right' },
    ],
  },
  {
    type: 'yearly_summary',  label: 'Yearly Summary',  category: 'sales',
    description: 'Sales totals rolled up by calendar year.',
    supportsShift: false,
    columns: [
      { key: 'year',        label: 'Year',       format: 'text' },
      { key: 'gross_sales', label: 'Gross Sales',format: 'currency', align: 'right' },
      { key: 'txn_count',   label: 'Transactions',format: 'integer', align: 'right' },
    ],
  },
];

export const REPORT_DEF_MAP: Record<ReportType, ReportDefinition> = Object.fromEntries(
  REPORT_DEFINITIONS.map(d => [d.type, d])
) as Record<ReportType, ReportDefinition>;
