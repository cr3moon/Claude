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
  | 'sales_by_department'
  | 'sales_by_category'
  | 'top_items_by_revenue'
  | 'tender_summary'
  | 'tax_summary'
  | 'voids_refunds'
  | 'cashier_performance'
  | 'margin_report'
  | 'price_change_history'
  | 'audit_recommendations'
  | 'over_short'
  | 'low_margin_items'
  | 'import_job_log'
  | 'inventory_valuation'
  | 'lottery_sales'
  | 'payroll_summary'
  | 'weekly_summary'
  | 'monthly_summary'
  | 'yearly_summary';

export interface ReportDefinition {
  id:             ReportType;
  name:           string;
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
    id: 'daily_shift', name: 'Daily Shift Summary', category: 'sales',
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
    id: 'eod_close', name: 'End-of-Day Close', category: 'operations',
    description: 'Full day close packet: sales, tenders, cash, over/short.',
    supportsShift: false,
    columns: [
      { key: 'metric', label: 'Metric', format: 'text' },
      { key: 'value',  label: 'Value',  format: 'currency', align: 'right' },
    ],
  },
  {
    id: 'sales_by_department', name: 'Sales by Department', category: 'sales',
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
    id: 'sales_by_category', name: 'Sales by Category', category: 'sales',
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
    id: 'top_items_by_revenue', name: 'Top Items by Revenue', category: 'sales',
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
    id: 'tender_summary', name: 'Tender Summary', category: 'sales',
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
    id: 'tax_summary', name: 'Tax Summary', category: 'sales',
    description: 'Taxable sales and tax collected by department.',
    supportsShift: false,
    columns: [
      { key: 'department',    label: 'Department',    format: 'text' },
      { key: 'taxable_sales', label: 'Taxable Sales', format: 'currency', align: 'right' },
      { key: 'total_tax',     label: 'Tax Collected', format: 'currency', align: 'right' },
    ],
  },
  {
    id: 'voids_refunds', name: 'Voids & Refunds', category: 'operations',
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
    id: 'cashier_performance', name: 'Cashier Performance', category: 'operations',
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
    id: 'margin_report', name: 'Margin Report', category: 'pricing',
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
    id: 'price_change_history', name: 'Price Change History', category: 'pricing',
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
    id: 'audit_recommendations', name: 'Audit Recommendations', category: 'compliance',
    description: 'Item data quality flags generated by the normalization rule engine.',
    supportsShift: false,
    columns: [
      { key: 'created_at',  label: 'Date',        format: 'datetime' },
      { key: 'pos_plu_id',  label: 'PLU',         format: 'text' },
      { key: 'description', label: 'Description', format: 'text' },
      { key: 'rule_code',   label: 'Rule',        format: 'text' },
      { key: 'severity',    label: 'Severity',    format: 'text' },
      { key: 'suggestion',  label: 'Suggestion',  format: 'text' },
      { key: 'status',      label: 'Status',      format: 'text' },
    ],
  },
  {
    id: 'over_short', name: 'Over/Short Summary', category: 'operations',
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
    id: 'low_margin_items', name: 'Low Margin Items', category: 'pricing',
    description: 'Items where gross margin falls below the department minimum margin.',
    supportsShift: false,
    columns: [
      { key: 'pos_plu_id',     label: 'PLU',           format: 'text' },
      { key: 'description',    label: 'Description',   format: 'text' },
      { key: 'dept_name',      label: 'Dept',           format: 'text' },
      { key: 'current_price',  label: 'Price',          format: 'currency', align: 'right' },
      { key: 'current_cost',   label: 'Cost',            format: 'currency', align: 'right' },
      { key: 'current_margin', label: 'Current Margin', format: 'percent',  align: 'right' },
      { key: 'target_margin',  label: 'Target Margin',  format: 'percent',  align: 'right' },
      { key: 'gap',            label: 'Gap',             format: 'percent',  align: 'right' },
    ],
  },
  {
    id: 'import_job_log', name: 'Import Job Log', category: 'operations',
    description: 'History of all data import jobs with record counts and status.',
    supportsShift: false,
    columns: [
      { key: 'created_at',      label: 'Date',          format: 'datetime' },
      { key: 'source_type',     label: 'Source',        format: 'text' },
      { key: 'adapter_type',    label: 'Adapter',       format: 'text' },
      { key: 'records_total',   label: 'Total',         format: 'integer', align: 'right' },
      { key: 'records_ok',      label: 'OK',            format: 'integer', align: 'right' },
      { key: 'records_skipped', label: 'Skipped',       format: 'integer', align: 'right' },
      { key: 'records_error',   label: 'Errors',        format: 'integer', align: 'right' },
      { key: 'status',          label: 'Status',        format: 'text' },
      { key: 'triggered_by',    label: 'Triggered By',  format: 'text' },
    ],
  },
  {
    id: 'inventory_valuation', name: 'Inventory Valuation', category: 'operations',
    description: 'On-hand quantity and extended value for every active item, with low-stock flags.',
    supportsShift: false,
    columns: [
      { key: 'pos_plu_id',     label: 'PLU',          format: 'text' },
      { key: 'description',    label: 'Description',  format: 'text' },
      { key: 'dept_name',      label: 'Dept',          format: 'text' },
      { key: 'on_hand_qty',    label: 'On Hand',       format: 'integer',  align: 'right' },
      { key: 'cost',           label: 'Cost',          format: 'currency', align: 'right' },
      { key: 'extended_value', label: 'Ext. Value',    format: 'currency', align: 'right' },
      { key: 'low_stock',      label: 'Low Stock',     format: 'text' },
    ],
  },
  {
    id: 'lottery_sales', name: 'Lottery Sales', category: 'sales',
    description: 'Instant ticket sales by game for the selected period, from count reconciliations.',
    supportsShift: false,
    columns: [
      { key: 'game_number',  label: 'Game #',       format: 'text' },
      { key: 'game_name',    label: 'Game',          format: 'text' },
      { key: 'tickets_sold', label: 'Tickets Sold',  format: 'integer',  align: 'right' },
      { key: 'sales_amount', label: 'Sales $',       format: 'currency', align: 'right' },
    ],
  },
  {
    id: 'payroll_summary', name: 'Payroll Summary', category: 'operations',
    description: 'Hours worked and estimated labor cost per employee for the selected period, from clock entries.',
    supportsShift: false,
    columns: [
      { key: 'display_name', label: 'Employee',    format: 'text' },
      { key: 'hours_worked', label: 'Hours',        format: 'text',     align: 'right' },
      { key: 'labor_cost',   label: 'Labor Cost',   format: 'currency', align: 'right' },
    ],
  },
  {
    id: 'weekly_summary', name: 'Weekly Summary', category: 'sales',
    description: 'Sales totals rolled up by week.',
    supportsShift: false,
    columns: [
      { key: 'week_start',  label: 'Week',       format: 'date' },
      { key: 'gross_sales', label: 'Gross Sales',format: 'currency', align: 'right' },
      { key: 'txn_count',   label: 'Transactions',format: 'integer', align: 'right' },
    ],
  },
  {
    id: 'monthly_summary', name: 'Monthly Summary', category: 'sales',
    description: 'Sales totals rolled up by calendar month.',
    supportsShift: false,
    columns: [
      { key: 'month',       label: 'Month',      format: 'text' },
      { key: 'gross_sales', label: 'Gross Sales',format: 'currency', align: 'right' },
      { key: 'txn_count',   label: 'Transactions',format: 'integer', align: 'right' },
    ],
  },
  {
    id: 'yearly_summary', name: 'Yearly Summary', category: 'sales',
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
  REPORT_DEFINITIONS.map(d => [d.id, d])
) as Record<ReportType, ReportDefinition>;
