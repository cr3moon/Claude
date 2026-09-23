-- OpenCStore Back Office – SQLite Schema
-- Version: 1.0.0
-- All timestamps are stored as ISO-8601 UTC strings.
-- IDs are UUIDs stored as TEXT.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ============================================================
-- STORE & USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS stores (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  phone           TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
  tax_rate        REAL NOT NULL DEFAULT 0.0,
  fuel_tax_rate   REAL NOT NULL DEFAULT 0.0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  pos_type        TEXT,           -- 'verifone_ruby2' | 'commander' | 'mock' | 'file_import'
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL CHECK(role IN ('owner','manager','cashier')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  hourly_wage     REAL,            -- optional, for payroll cost estimates; never required
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  token_hash      TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  invalidated_at  TEXT
);

-- ============================================================
-- CONNECTION SETTINGS (no plaintext secrets stored here)
-- Actual credentials are stored in OS keychain or encrypted file.
-- This table only stores non-secret connection metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS connection_settings (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  adapter_type    TEXT NOT NULL,  -- 'verifone_ruby2' | 'commander' | 'mock' | 'file_import'
  host            TEXT,           -- IP/hostname, no default
  port            INTEGER,
  db_name         TEXT,
  username_hint   TEXT,           -- hint only, no password stored here
  use_ssl         INTEGER NOT NULL DEFAULT 0,
  read_only       INTEGER NOT NULL DEFAULT 1,
  connection_status TEXT NOT NULL DEFAULT 'untested', -- 'untested'|'ok'|'failed'
  last_tested_at  TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- BACKUP & IMPORT TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS backup_manifest (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  triggered_by    TEXT NOT NULL REFERENCES users(id),
  backup_type     TEXT NOT NULL, -- 'full' | 'plu' | 'pricebook' | 'transactions'
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER,
  checksum        TEXT,
  source_adapter  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'complete'|'failed'
  notes           TEXT,
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  triggered_by    TEXT NOT NULL REFERENCES users(id),
  source_type     TEXT NOT NULL, -- 'xml_plu'|'csv_pricebook'|'csv_transactions'|'api'
  source_file     TEXT,
  adapter_type    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  records_total   INTEGER DEFAULT 0,
  records_ok      INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  records_error   INTEGER DEFAULT 0,
  error_detail    TEXT,
  backup_id       TEXT REFERENCES backup_manifest(id),
  created_at      TEXT NOT NULL,
  completed_at    TEXT
);

-- ============================================================
-- PRODUCT CATALOG (PLU / ITEM MASTER)
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_dept_id     TEXT NOT NULL,  -- native POS identifier
  name            TEXT NOT NULL,
  tax_flag        INTEGER NOT NULL DEFAULT 0,
  age_restricted  INTEGER NOT NULL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,           -- original JSON from import
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  department_id   TEXT REFERENCES departments(id),
  pos_category_id TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plu_items (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_plu_id      TEXT NOT NULL,
  description     TEXT NOT NULL,
  description_short TEXT,
  department_id   TEXT REFERENCES departments(id),
  category_id     TEXT REFERENCES categories(id),
  tax_flag        INTEGER NOT NULL DEFAULT 0,
  age_restricted  INTEGER NOT NULL DEFAULT 0,
  foodstamp_eligible INTEGER NOT NULL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  unit_descriptor TEXT,           -- 'EA'|'PK'|'CS'|'LB'|'OZ'|etc.
  pack_size       INTEGER DEFAULT 1,
  cost            REAL,
  retail_price    REAL,
  sale_price      REAL,
  on_hand_qty     REAL NOT NULL DEFAULT 0,  -- units, kept current by deliveries + inventory_adjustments
  reorder_point   REAL,                     -- below this qty, item shows as low-stock; NULL = no threshold set
  mix_match_group TEXT,
  loyalty_eligible INTEGER NOT NULL DEFAULT 0,
  vendor_code     TEXT,
  product_code    TEXT,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_codes (
  id              TEXT PRIMARY KEY,
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id) ON DELETE CASCADE,
  barcode         TEXT NOT NULL,
  barcode_type    TEXT NOT NULL DEFAULT 'UPC_A', -- 'UPC_A'|'UPC_E'|'EAN_13'|'ITF'|'CODE_128'|'PLU'
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_codes_barcode_store
  ON scan_codes(plu_item_id, barcode);

-- ============================================================
-- PRICEBOOK
-- ============================================================

CREATE TABLE IF NOT EXISTS pricebook_entries (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  price_level     TEXT NOT NULL DEFAULT 'regular', -- 'regular'|'sale'|'loyalty'|'wholesale'
  effective_date  TEXT NOT NULL,
  end_date        TEXT,
  retail_price    REAL NOT NULL,
  cost            REAL,
  margin_pct      REAL,           -- stored computed for reporting speed
  is_active       INTEGER NOT NULL DEFAULT 1,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- CASHIERS (POS operator records)
-- ============================================================

CREATE TABLE IF NOT EXISTS pos_cashiers (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_cashier_id  TEXT NOT NULL,
  name            TEXT NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- SHIFTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shifts (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  pos_shift_id    TEXT,
  shift_number    INTEGER,
  cashier_id      TEXT REFERENCES pos_cashiers(id),
  cashier_user_id TEXT REFERENCES users(id),  -- set when the shift is opened manually from the Operations page
  status          TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  opened_at       TEXT NOT NULL,
  closed_at       TEXT,
  opening_cash    REAL DEFAULT 0,
  closing_cash    REAL DEFAULT 0,
  expected_cash   REAL DEFAULT 0,
  over_short      REAL DEFAULT 0,
  total_sales     REAL DEFAULT 0,
  total_voids     REAL DEFAULT 0,
  total_refunds   REAL DEFAULT 0,
  total_discounts REAL DEFAULT 0,
  total_tax       REAL DEFAULT 0,
  source_raw      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  shift_id        TEXT REFERENCES shifts(id),
  pos_txn_id      TEXT NOT NULL,
  cashier_id      TEXT REFERENCES pos_cashiers(id),
  txn_type        TEXT NOT NULL DEFAULT 'sale', -- 'sale'|'void'|'refund'|'no_sale'
  txn_at          TEXT NOT NULL,
  subtotal        REAL NOT NULL DEFAULT 0,
  discount_total  REAL NOT NULL DEFAULT 0,
  tax_total       REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  is_training     INTEGER NOT NULL DEFAULT 0,
  source_raw      TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  plu_item_id     TEXT REFERENCES plu_items(id),
  pos_plu_id      TEXT,
  description     TEXT,
  quantity        REAL NOT NULL DEFAULT 1,
  unit_price      REAL NOT NULL DEFAULT 0,
  ext_price       REAL NOT NULL DEFAULT 0,
  cost            REAL,
  tax_amount      REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  is_fuel         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- FUEL SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS fuel_sales (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  import_job_id   TEXT REFERENCES import_jobs(id),
  shift_id        TEXT REFERENCES shifts(id),
  grade           TEXT NOT NULL, -- 'regular'|'midgrade'|'premium'|'diesel'|'e85'
  pump_number     INTEGER,
  hose_number     INTEGER,
  gallons         REAL NOT NULL DEFAULT 0,
  price_per_gallon REAL NOT NULL DEFAULT 0,
  total_amount    REAL NOT NULL DEFAULT 0,
  cost_per_gallon REAL,
  txn_at          TEXT NOT NULL,
  source_raw      TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- TENDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenders (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tender_type     TEXT NOT NULL, -- 'cash'|'credit'|'debit'|'ebt_food'|'ebt_cash'|'check'|'gift_card'|'mobile'|'other'
  amount          REAL NOT NULL DEFAULT 0,
  change_given    REAL DEFAULT 0,
  card_type       TEXT,           -- 'visa'|'mc'|'amex'|'disc'|etc.
  approval_code   TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- ITEM AUDIT / RECOMMENDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS item_recommendations (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT REFERENCES plu_items(id),
  job_run_id      TEXT NOT NULL,  -- UUID grouping a recommendation batch
  field_name      TEXT NOT NULL,  -- 'description'|'department'|'category'|'tax_flag'|'unit_descriptor'|'age_restricted'|'upc'|etc.
  current_value   TEXT,
  recommended_value TEXT,
  reason          TEXT NOT NULL,
  rule_code       TEXT NOT NULL,  -- short machine code, e.g. 'BLANK_DESC', 'DUP_UPC'
  confidence      REAL NOT NULL DEFAULT 0.5, -- 0.0–1.0
  requires_manual_review INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'applied'|'skipped'
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  review_notes    TEXT,
  applied_at      TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- PRICING RECOMMENDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  job_run_id      TEXT NOT NULL,
  current_retail  REAL NOT NULL,
  current_cost    REAL,
  current_margin_pct REAL,
  recommended_retail REAL NOT NULL,
  estimated_margin_pct REAL,
  reason          TEXT NOT NULL,
  rule_code       TEXT NOT NULL,
  confidence      REAL NOT NULL DEFAULT 0.5,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT REFERENCES users(id),
  reviewed_at     TEXT,
  review_notes    TEXT,
  applied_at      TEXT,
  created_at      TEXT NOT NULL
);

-- Price change history (immutable after insert)
CREATE TABLE IF NOT EXISTS price_change_history (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  changed_by      TEXT NOT NULL REFERENCES users(id),
  recommendation_id TEXT REFERENCES pricing_recommendations(id),
  old_retail      REAL,
  new_retail      REAL,
  old_cost        REAL,
  new_cost        REAL,
  old_margin_pct  REAL,
  new_margin_pct  REAL,
  change_reason   TEXT,
  change_method   TEXT NOT NULL DEFAULT 'manual', -- 'manual'|'recommendation'|'import'
  write_back_status TEXT DEFAULT 'pending_export', -- 'pending_export'|'exported'|'applied_pos'|'rolled_back'
  rollback_snapshot TEXT, -- JSON snapshot for rollback
  created_at      TEXT NOT NULL
);

-- ============================================================
-- APPROVAL QUEUE (write-back plan)
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_queue (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  queue_type      TEXT NOT NULL, -- 'item_change'|'price_change'
  batch_id        TEXT NOT NULL, -- groups related changes in one write-back plan
  reference_id    TEXT NOT NULL, -- FK to item_recommendations or pricing_recommendations
  description     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'applied'|'failed'
  approved_by     TEXT REFERENCES users(id),
  approved_at     TEXT,
  applied_by      TEXT REFERENCES users(id),
  applied_at      TEXT,
  error_detail    TEXT,
  created_at      TEXT NOT NULL
);

-- ============================================================
-- DAILY OPERATIONS / CHECKLISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_checklists (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  shift_id        TEXT REFERENCES shifts(id),
  checklist_type  TEXT NOT NULL, -- 'shift_open'|'shift_close'|'day_close'|'shift_handoff'
  operator_name   TEXT NOT NULL,
  operator_initials TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  over_short_amount REAL DEFAULT 0,
  manager_notes   TEXT,
  is_complete     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_steps (
  id              TEXT PRIMARY KEY,
  checklist_id    TEXT NOT NULL REFERENCES shift_checklists(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,  -- machine key
  step_label      TEXT NOT NULL,
  step_order      INTEGER NOT NULL DEFAULT 0,
  completed       INTEGER NOT NULL DEFAULT 0,
  completed_at    TEXT,
  completed_by    TEXT,
  notes           TEXT,
  numeric_value   REAL,           -- for cash counts, fuel readings, etc.
  created_at      TEXT NOT NULL
);

-- ============================================================
-- REPORTS ARCHIVE
-- ============================================================

CREATE TABLE IF NOT EXISTS reports_archive (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  report_type     TEXT NOT NULL,  -- 'daily_shift'|'eod'|'sales_dept'|'margin'|etc.
  report_period_start TEXT NOT NULL,
  report_period_end   TEXT NOT NULL,
  generated_by    TEXT NOT NULL REFERENCES users(id),
  parameters      TEXT,           -- JSON of filters
  data_snapshot   TEXT NOT NULL,  -- full JSON report payload
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_close_packets (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  business_date   TEXT NOT NULL,
  closed_by       TEXT NOT NULL REFERENCES users(id),
  shift_ids       TEXT NOT NULL,  -- JSON array of shift ids
  total_sales     REAL NOT NULL DEFAULT 0,
  total_cash      REAL NOT NULL DEFAULT 0,
  total_credit    REAL NOT NULL DEFAULT 0,
  total_over_short REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  packet_data     TEXT NOT NULL,  -- full JSON close packet
  created_at      TEXT NOT NULL
);

-- ============================================================
-- AUDIT LOG (append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  store_id        TEXT,
  user_id         TEXT,
  session_id      TEXT,
  event_type      TEXT NOT NULL,
  event_subtype   TEXT,
  description     TEXT NOT NULL,
  entity_type     TEXT,           -- 'plu_item'|'shift'|'recommendation'|etc.
  entity_id       TEXT,
  before_state    TEXT,           -- JSON snapshot before change
  after_state     TEXT,           -- JSON snapshot after change
  ip_address      TEXT,
  result          TEXT NOT NULL DEFAULT 'success', -- 'success'|'failure'|'warning'
  error_detail    TEXT,
  created_at      TEXT NOT NULL
);

-- Prevent any UPDATE or DELETE on audit_log at schema level hint
-- Application layer enforces append-only; no triggers needed in SQLite
-- but documented for operators.

-- ============================================================
-- APP STATE / SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  updated_at      TEXT NOT NULL
);

-- Onboarding completion flag
INSERT OR IGNORE INTO app_settings(key, value, description, updated_at)
  VALUES('onboarding_complete', 'false', 'Whether the first-run wizard has been completed', datetime('now'));

INSERT OR IGNORE INTO app_settings(key, value, description, updated_at)
  VALUES('schema_version', '1', 'Current database schema version', datetime('now'));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_plu_items_store       ON plu_items(store_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_dept         ON plu_items(department_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_cat          ON plu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_plu_items_pos_plu_id   ON plu_items(pos_plu_id);
CREATE INDEX IF NOT EXISTS idx_scan_codes_barcode      ON scan_codes(barcode);
CREATE INDEX IF NOT EXISTS idx_transactions_shift      ON transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_at         ON transactions(txn_at);
CREATE INDEX IF NOT EXISTS idx_transaction_items_plu   ON transaction_items(plu_item_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store            ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_item_rec_store_job      ON item_recommendations(store_id, job_run_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rec_store_job   ON pricing_recommendations(store_id, job_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_store         ON audit_log(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event         ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created       ON audit_log(created_at);

-- ============================================================
-- SUPPLEMENTAL TABLES (v1.1)
-- ============================================================

-- Raw source files tracked per import job
CREATE TABLE IF NOT EXISTS source_files (
  id              TEXT PRIMARY KEY,
  import_job_id   TEXT NOT NULL REFERENCES import_jobs(id),
  store_id        TEXT NOT NULL REFERENCES stores(id),
  original_name   TEXT NOT NULL,
  stored_path     TEXT NOT NULL,
  file_size_bytes INTEGER,
  format          TEXT NOT NULL,           -- 'xml_plu' | 'csv_pricebook' | 'csv_transactions'
  checksum        TEXT,
  row_count       INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL
);

-- Extended product code registry (UPC-A, UPC-E, EAN-13, ITF-14, etc.)
CREATE TABLE IF NOT EXISTS product_codes (
  id              TEXT PRIMARY KEY,
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id) ON DELETE CASCADE,
  code_type       TEXT NOT NULL,           -- 'upc_a' | 'upc_e' | 'ean13' | 'itf14' | 'internal'
  code_value      TEXT NOT NULL,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_codes_unique
  ON product_codes(plu_item_id, code_type, code_value);

-- Cost history per PLU item
CREATE TABLE IF NOT EXISTS costs (
  id              TEXT PRIMARY KEY,
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id) ON DELETE CASCADE,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  unit_cost       REAL NOT NULL,
  vendor_name     TEXT,
  vendor_sku      TEXT,
  pack_size       INTEGER NOT NULL DEFAULT 1,
  case_cost       REAL,
  effective_date  TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'import' | 'invoice'
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_costs_plu_date ON costs(plu_item_id, effective_date DESC);

-- Daily sales aggregations (summarised from transaction_items)
CREATE TABLE IF NOT EXISTS sales_daily (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  sale_date       TEXT NOT NULL,           -- YYYY-MM-DD
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  dept_id         TEXT REFERENCES departments(id),
  qty_sold        INTEGER NOT NULL DEFAULT 0,
  total_revenue   REAL NOT NULL DEFAULT 0.0,
  total_cost      REAL NOT NULL DEFAULT 0.0,
  gross_margin    REAL NOT NULL DEFAULT 0.0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_daily_unique
  ON sales_daily(store_id, sale_date, plu_item_id);

-- Shift-level sales aggregations
CREATE TABLE IF NOT EXISTS sales_shift (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  shift_id        TEXT NOT NULL REFERENCES shifts(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  qty_sold        INTEGER NOT NULL DEFAULT 0,
  total_revenue   REAL NOT NULL DEFAULT 0.0,
  total_cost      REAL NOT NULL DEFAULT 0.0,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_shift_shift ON sales_shift(shift_id);

-- Tax rate configuration
CREATE TABLE IF NOT EXISTS taxes (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  tax_name        TEXT NOT NULL,
  rate            REAL NOT NULL,           -- e.g. 0.0825 for 8.25%
  applies_to      TEXT NOT NULL DEFAULT 'all', -- 'all' | 'food' | 'non_food' | 'alcohol' | 'fuel'
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Configured normalization rule overrides (enable/disable per store)
CREATE TABLE IF NOT EXISTS item_audit_rules (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  rule_code       TEXT NOT NULL,
  is_enabled      INTEGER NOT NULL DEFAULT 1,
  severity_override TEXT,                  -- NULL means use default
  notes           TEXT,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_item_audit_rules_unique
  ON item_audit_rules(store_id, rule_code);

-- Configured pricing rule overrides per department pattern
CREATE TABLE IF NOT EXISTS pricing_rules (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  dept_pattern    TEXT NOT NULL,           -- regex or wildcard matched against dept_name
  target_margin   REAL NOT NULL,
  min_margin      REAL,
  max_margin      REAL,
  price_ending    TEXT,                    -- e.g. '.99' | '.49' | null (use default)
  is_active       INTEGER NOT NULL DEFAULT 1,
  priority        INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Recommendation approval workflow tracking
CREATE TABLE IF NOT EXISTS recommendation_approvals (
  id                   TEXT PRIMARY KEY,
  recommendation_id    TEXT NOT NULL,      -- FK to item_recommendations or pricing_recommendations
  recommendation_type  TEXT NOT NULL,      -- 'item' | 'pricing'
  store_id             TEXT NOT NULL REFERENCES stores(id),
  action               TEXT NOT NULL,      -- 'approved' | 'rejected' | 'deferred'
  actioned_by          TEXT NOT NULL REFERENCES users(id),
  notes                TEXT,
  created_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rec_approvals_rec ON recommendation_approvals(recommendation_id);

-- Report run history (extends reports_archive with execution metadata)
CREATE TABLE IF NOT EXISTS report_runs (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  report_id       TEXT NOT NULL,           -- matches ReportDefinition.id
  report_name     TEXT NOT NULL,
  params          TEXT,                    -- JSON: { date_from, date_to, ... }
  row_count       INTEGER,
  duration_ms     INTEGER,
  exported_format TEXT,                    -- 'csv' | 'pdf' | 'print' | null
  run_by          TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_runs_store ON report_runs(store_id, created_at DESC);

-- Checklist run instances (one row per started checklist)
CREATE TABLE IF NOT EXISTS checklist_runs (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  shift_id        TEXT REFERENCES shifts(id),
  template_id     TEXT NOT NULL,           -- 'shift_open' | 'shift_close' | 'day_close' | 'shift_handoff'
  started_by      TEXT NOT NULL REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'complete' | 'abandoned'
  steps_total     INTEGER NOT NULL DEFAULT 0,
  steps_done      INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT NOT NULL,
  completed_at    TEXT
);

-- Individual step completions for a checklist run
CREATE TABLE IF NOT EXISTS checklist_run_steps (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
  step_key        TEXT NOT NULL,
  label           TEXT NOT NULL,
  completed       INTEGER NOT NULL DEFAULT 0,
  completed_by    TEXT REFERENCES users(id),
  completed_at    TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_checklist_run_steps_run ON checklist_run_steps(run_id);

-- Rollback records for applied price changes
CREATE TABLE IF NOT EXISTS rollback_records (
  id                   TEXT PRIMARY KEY,
  store_id             TEXT NOT NULL REFERENCES stores(id),
  rollback_type        TEXT NOT NULL,      -- 'price_change' | 'import'
  source_backup_id     TEXT REFERENCES backup_manifest(id),
  target_entity_type   TEXT NOT NULL,
  target_entity_ids    TEXT NOT NULL,      -- JSON array of affected IDs
  snapshot_before      TEXT NOT NULL,      -- JSON snapshot of pre-change state
  status               TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'applied' | 'failed'
  initiated_by         TEXT NOT NULL REFERENCES users(id),
  applied_at           TEXT,
  notes                TEXT,
  created_at           TEXT NOT NULL
);

-- ============================================================
-- INVENTORY & RECEIVING
-- ============================================================

CREATE TABLE IF NOT EXISTS vendors (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  name            TEXT NOT NULL,
  contact_name    TEXT,
  phone           TEXT,
  email           TEXT,
  account_number  TEXT,           -- this vendor's account/customer number for the store, not a secret
  notes           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- A single delivery/invoice from a vendor. Draft while being entered;
-- receiving it (status='received') is the only thing that moves
-- on_hand_qty and writes cost history — matches the rest of the app's
-- pattern of an explicit, auditable commit step rather than live-editing
-- on_hand_qty directly.
CREATE TABLE IF NOT EXISTS deliveries (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  vendor_id       TEXT NOT NULL REFERENCES vendors(id),
  invoice_number  TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'received' | 'voided'
  notes           TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  received_by     TEXT REFERENCES users(id),
  received_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_lines (
  id              TEXT PRIMARY KEY,
  delivery_id     TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  qty             REAL NOT NULL,
  unit_cost       REAL NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_lines_delivery ON delivery_lines(delivery_id);

-- Manual on-hand corrections: physical counts, shrink, waste, damage.
-- Each row is a delta (positive or negative) applied to plu_items.on_hand_qty,
-- kept as a permanent log rather than overwriting on_hand_qty in place so
-- shrink/waste can be reported on later (mirrors price_change_history's
-- append-only pattern for pricing).
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  plu_item_id     TEXT NOT NULL REFERENCES plu_items(id),
  qty_delta       REAL NOT NULL,   -- positive = found/added, negative = shrink/waste/damage
  reason_code     TEXT NOT NULL,   -- 'physical_count' | 'shrink' | 'waste' | 'damage' | 'other'
  notes           TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_item ON inventory_adjustments(plu_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_store ON inventory_adjustments(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_store ON deliveries(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendors_store ON vendors(store_id);

-- ============================================================
-- LOTTERY (instant / scratch-off tickets)
-- ============================================================

-- One row per state lottery game (e.g. "Game #1234, $5 Diamond Jubilee").
-- ticket_price × book_size is the full value of an unsold book.
CREATE TABLE IF NOT EXISTS lottery_games (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  game_number     TEXT NOT NULL,   -- lottery commission's game number, not a local id
  name            TEXT NOT NULL,
  ticket_price    REAL NOT NULL,
  book_size       INTEGER NOT NULL, -- tickets per book
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- A single physical book of tickets. current_ticket_number is a running
-- "tickets sold so far" counter (0..book_size), advanced only through
-- lottery_counts — never edited directly, same derived-total pattern as
-- plu_items.on_hand_qty.
CREATE TABLE IF NOT EXISTS lottery_books (
  id                    TEXT PRIMARY KEY,
  store_id              TEXT NOT NULL REFERENCES stores(id),
  game_id               TEXT NOT NULL REFERENCES lottery_games(id),
  book_number           TEXT NOT NULL,  -- serial printed on the book
  status                TEXT NOT NULL DEFAULT 'received', -- 'received'|'active'|'settled'|'returned'
  current_ticket_number INTEGER NOT NULL DEFAULT 0,
  received_at           TEXT NOT NULL,
  activated_at          TEXT,
  settled_at            TEXT,
  created_by            TEXT NOT NULL REFERENCES users(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lottery_books_serial ON lottery_books(store_id, game_id, book_number);

-- Append-only count log. Each row is one count event: staff reads the
-- ticket number off an active book, the delta since the previous count is
-- that many tickets sold (and that many dollars, at the game's price).
CREATE TABLE IF NOT EXISTS lottery_counts (
  id                TEXT PRIMARY KEY,
  store_id          TEXT NOT NULL REFERENCES stores(id),
  book_id           TEXT NOT NULL REFERENCES lottery_books(id),
  ticket_number     INTEGER NOT NULL,   -- cumulative tickets sold as of this count
  tickets_sold      INTEGER NOT NULL,   -- delta vs. the previous count
  sales_amount      REAL NOT NULL,      -- tickets_sold * game's ticket_price at count time
  counted_by        TEXT NOT NULL REFERENCES users(id),
  counted_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lottery_counts_book ON lottery_counts(book_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_lottery_counts_store ON lottery_counts(store_id, counted_at DESC);
CREATE INDEX IF NOT EXISTS idx_lottery_books_store ON lottery_books(store_id, status);
CREATE INDEX IF NOT EXISTS idx_lottery_games_store ON lottery_games(store_id);

-- ============================================================
-- MULTI-STORE ACCESS
-- ============================================================

-- A user's home store is users.store_id (set at account creation, always
-- present). This table grants ADDITIONAL stores to a user — e.g. an owner
-- who opens a second location keeps their original home store and is
-- granted access to the new one, rather than every store needing its own
-- separate login. All stores and users in a single install belong to the
-- same operator by construction (one desktop app, one local database), so
-- any store here can be granted to any user here.
CREATE TABLE IF NOT EXISTS user_store_access (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  store_id        TEXT NOT NULL REFERENCES stores(id),
  granted_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_store_access_unique ON user_store_access(user_id, store_id);
CREATE INDEX IF NOT EXISTS idx_user_store_access_user ON user_store_access(user_id);

-- ============================================================
-- TIME CLOCK
-- ============================================================

-- One row per clock-in/clock-out pair. clock_out is NULL while the
-- employee is still clocked in. break_minutes is a single unpaid-break
-- deduction entered at clock-out (covers the common case without modeling
-- individual break start/end events). edited_* is set only when a manager
-- corrects an entry (e.g. someone forgot to clock out) — kept alongside
-- the original clock_in/out rather than as a separate log, since a time
-- entry has exactly one current value at a time, unlike price history.
CREATE TABLE IF NOT EXISTS time_clock_entries (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  clock_in        TEXT NOT NULL,
  clock_out       TEXT,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  edited_by       TEXT REFERENCES users(id),
  edited_at       TEXT,
  edit_reason     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_time_clock_user ON time_clock_entries(user_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_store ON time_clock_entries(store_id, clock_in DESC);
-- At most one open (clock_out IS NULL) entry per employee at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open_per_user
  ON time_clock_entries(user_id) WHERE clock_out IS NULL;

-- ============================================================
-- DASHBOARD DATA (manual sales entry + fuel snapshots)
-- ============================================================
--
-- This app has no live POS transaction feed — transactions/sales_daily/
-- sales_shift above are schema for one, but nothing populates them. Until
-- a real feed exists, department/merchandise sales for the dashboard come
-- from a manager typing in each day's department totals by hand (one row
-- per store/date/department; re-entering a day updates it rather than
-- duplicating). Fuel sales/volume trend comes from periodically snapshotting
-- Commander's cumulative day-total (itself a live read, not stored
-- history) into a row per store/date/grade — see FuelSnapshotService.

CREATE TABLE IF NOT EXISTS manual_sales_entries (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  entry_date      TEXT NOT NULL,   -- 'YYYY-MM-DD'
  department_id   TEXT NOT NULL REFERENCES departments(id),
  amount          REAL NOT NULL,
  entered_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_sales_unique ON manual_sales_entries(store_id, entry_date, department_id);
CREATE INDEX IF NOT EXISTS idx_manual_sales_store_date ON manual_sales_entries(store_id, entry_date);

CREATE TABLE IF NOT EXISTS fuel_sales_snapshots (
  id              TEXT PRIMARY KEY,
  store_id        TEXT NOT NULL REFERENCES stores(id),
  snapshot_date   TEXT NOT NULL,   -- 'YYYY-MM-DD'
  grade           TEXT NOT NULL,   -- matches CommanderNaxmlClient's FuelGradeTotal.grade
  gallons         REAL NOT NULL,
  revenue         REAL NOT NULL,
  source          TEXT NOT NULL DEFAULT 'commander', -- 'commander' | 'manual'
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fuel_snapshot_unique ON fuel_sales_snapshots(store_id, snapshot_date, grade);
CREATE INDEX IF NOT EXISTS idx_fuel_snapshot_store_date ON fuel_sales_snapshots(store_id, snapshot_date);

-- ============================================================
-- SUPPLEMENTAL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_source_files_job     ON source_files(import_job_id);
CREATE INDEX IF NOT EXISTS idx_costs_store          ON costs(store_id);
CREATE INDEX IF NOT EXISTS idx_sales_daily_date     ON sales_daily(store_id, sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_shift_store    ON sales_shift(store_id);
CREATE INDEX IF NOT EXISTS idx_checklist_runs_store ON checklist_runs(store_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rollback_store       ON rollback_records(store_id, created_at DESC);
